"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  advanceApiEpoch,
  ApiClientError,
  apiRequest,
} from "@/lib/api-client";
import type { StudentProfileDTO } from "@/types/normalizers";

export type AuthStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "error";

interface AuthContextType {
  student: StudentProfileDTO | null;
  status: AuthStatus;
  message: string | null;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
}

interface SessionData {
  authenticated: boolean;
  student: StudentProfileDTO;
  expiresAt: number;
}

interface LoginData {
  user: StudentProfileDTO;
  expiresAt: number;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [student, setStudent] = useState<StudentProfileDTO | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  const requestGeneration = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const isMutating = useRef(false);
  const isRefreshing = useRef(false);
  const activeStudentId = useRef<string | null>(null);
  const sessionExpiresAt = useRef<number | null>(null);
  const expirationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingRequest = useCallback(() => {
    requestGeneration.current++;
    requestController.current?.abort();
  }, []);

  const clearExpirationTimer = useCallback(() => {
    if (expirationTimer.current) clearTimeout(expirationTimer.current);
    expirationTimer.current = null;
  }, []);

  const invalidateSession = useCallback(() => {
    requestGeneration.current++;
    advanceApiEpoch();
    requestController.current?.abort();
    clearExpirationTimer();
    sessionExpiresAt.current = null;
    activeStudentId.current = null;
    setStudent(null);
    setStatus("unauthenticated");
    setMessage(null);
  }, [clearExpirationTimer]);

  const beginRequest = useCallback((newSession = false) => {
    requestGeneration.current++;
    if (newSession) advanceApiEpoch();

    requestController.current?.abort();
    const nextController = new AbortController();
    requestController.current = nextController;

    return {
      id: requestGeneration.current,
      signal: nextController.signal,
    };
  }, []);

  const acceptSession = useCallback(
    (profile: StudentProfileDTO, expiration: number) => {
      if (
        !profile?.numero_control ||
        !Number.isFinite(expiration) ||
        expiration * 1000 <= Date.now()
      ) {
        throw new ApiClientError(
          "La sesión ha expirado. Inicia sesión nuevamente.",
          401,
          "SESSION_EXPIRED",
        );
      }

      if (
        activeStudentId.current !== null &&
        activeStudentId.current !== profile.numero_control
      ) {
        advanceApiEpoch();
      }

      activeStudentId.current = profile.numero_control;
      clearExpirationTimer();
      sessionExpiresAt.current = expiration;
      setStudent(profile);
      setStatus("authenticated");
      setMessage(null);
      expirationTimer.current = setTimeout(
        invalidateSession,
        Math.min(expiration * 1000 - Date.now(), 86400000),
      );
    },
    [clearExpirationTimer, invalidateSession],
  );

  const refresh = useCallback(async () => {
    if (isMutating.current || isRefreshing.current) return;

    isRefreshing.current = true;
    const request = beginRequest();

    try {
      const data = await apiRequest<SessionData>("/api/auth/session", {
        signal: request.signal,
      });

      if (requestGeneration.current === request.id) {
        if (!data.authenticated) {
          throw new ApiClientError("Sesión no válida", 401);
        }

        acceptSession(data.student, data.expiresAt);
      }
    } catch (error) {
      if (request.signal.aborted || requestGeneration.current !== request.id) {
        return;
      }

      clearExpirationTimer();
      sessionExpiresAt.current = null;
      setStudent(null);

      if (error instanceof ApiClientError && error.status === 401) {
        invalidateSession();
      } else {
        setStatus("error");
        setMessage(
          error instanceof ApiClientError
            ? error.message
            : "No fue posible verificar la sesión. Intenta de nuevo.",
        );
      }
    } finally {
      isRefreshing.current = false;
    }
  }, [
    acceptSession,
    beginRequest,
    clearExpirationTimer,
    invalidateSession,
  ]);

  const login = useCallback(
    async (email: string, password: string) => {
      if (isMutating.current) return;

      isMutating.current = true;
      const request = beginRequest(true);
      setMessage(null);

      try {
        await apiRequest<LoginData>("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
          signal: request.signal,
        });

        const data = await apiRequest<SessionData>("/api/auth/session", {
          signal: request.signal,
        });

        if (requestGeneration.current === request.id && !request.signal.aborted) {
          if (!data.authenticated) {
            throw new ApiClientError("Sesión no válida", 401);
          }

          acceptSession(data.student, data.expiresAt);
          router.replace("/dashboard");
        }
      } catch (error) {
        if (requestGeneration.current === request.id) {
          setMessage(
            error instanceof ApiClientError
              ? error.message
              : "No fue posible iniciar sesión.",
          );
        }

        throw error;
      } finally {
        isMutating.current = false;
      }
    },
    [acceptSession, beginRequest, router],
  );

  const logout = useCallback(async () => {
    if (isMutating.current) return;

    isMutating.current = true;
    const request = beginRequest();

    try {
      await apiRequest("/api/auth/logout", {
        method: "POST",
        signal: request.signal,
      });

      if (requestGeneration.current === request.id) {
        invalidateSession();
        router.replace("/login");
      }
    } catch (error) {
      if (requestGeneration.current === request.id) {
        setMessage(
          error instanceof ApiClientError
            ? error.message
            : "No fue posible cerrar la sesión. Intenta de nuevo.",
        );
      }

      throw error;
    } finally {
      isMutating.current = false;
    }
  }, [beginRequest, invalidateSession, router]);

  useEffect(() => {
    const handleUnauthorized = () => invalidateSession();

    const revalidateWhenActive = () => {
      if (document.visibilityState !== "visible" || isMutating.current) return;

      if (
        sessionExpiresAt.current !== null &&
        sessionExpiresAt.current * 1000 <= Date.now()
      ) {
        invalidateSession();
      } else {
        void refresh();
      }
    };

    window.addEventListener("sii:unauthorized", handleUnauthorized);
    document.addEventListener("visibilitychange", revalidateWhenActive);
    window.addEventListener("focus", revalidateWhenActive);

    const initialRefresh = setTimeout(() => {
      void refresh();
    }, 0);

    return () => {
      clearTimeout(initialRefresh);
      cancelPendingRequest();
      clearExpirationTimer();
      window.removeEventListener("sii:unauthorized", handleUnauthorized);
      document.removeEventListener("visibilitychange", revalidateWhenActive);
      window.removeEventListener("focus", revalidateWhenActive);
    };
  }, [
    cancelPendingRequest,
    clearExpirationTimer,
    invalidateSession,
    refresh,
  ]);

  const value = useMemo(
    () => ({ student, status, message, login, logout, refresh }),
    [student, status, message, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth requires AuthProvider");
  }

  return value;
}
