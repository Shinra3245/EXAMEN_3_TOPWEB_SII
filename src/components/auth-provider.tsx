"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { apiRequest, ApiClientError, advanceApiEpoch } from "@/lib/api-client";
import type { StudentProfileDTO } from "@/types/normalizers";
export type AuthStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "error";
interface AuthContextType {
  student: StudentProfileDTO | null;
  esAdmin: boolean;
  status: AuthStatus;
  message: string | null;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
}
interface SessionData {
  authenticated: boolean;
  student: StudentProfileDTO;
  es_admin?: boolean;
  expiresAt: number;
}
interface LoginData {
  user: StudentProfileDTO;
  expiresAt: number;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [student, setStudent] = useState<StudentProfileDTO | null>(null);
  const [esAdmin, setEsAdmin] = useState(false);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const refreshing = useRef(false);
  const identity = useRef<string | null>(null);
  const expires = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopRequest = useCallback(() => {
    generation.current++;
    controller.current?.abort();
  }, []);
  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const invalidate = useCallback(() => {
    generation.current++;
    advanceApiEpoch();
    controller.current?.abort();
    clearTimer();
    expires.current = null;
    identity.current = null;
    setStudent(null);
    setEsAdmin(false);
    setStatus("unauthenticated");
    setMessage(null);
  }, [clearTimer]);
  const begin = useCallback((newSession = false) => {
    generation.current++;
    if (newSession) advanceApiEpoch();
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    return { id: generation.current, signal: next.signal };
  }, []);
  const accept = useCallback(
    (profile: StudentProfileDTO, expiration: number, isAdmin?: boolean) => {
      if (
        !profile?.numero_control ||
        !Number.isFinite(expiration) ||
        expiration * 1000 <= Date.now()
      )
        throw new ApiClientError(
          "La sesión ha expirado. Inicia sesión nuevamente.",
          401,
          "SESSION_EXPIRED",
        );
      if (
        identity.current !== null &&
        identity.current !== profile.numero_control
      )
        advanceApiEpoch();
      identity.current = profile.numero_control;
      clearTimer();
      expires.current = expiration;
      setStudent(profile);
      setEsAdmin(Boolean(isAdmin));
      setStatus("authenticated");
      setMessage(null);
      timer.current = setTimeout(
        invalidate,
        Math.min(expiration * 1000 - Date.now(), 86400000),
      );
    },
    [clearTimer, invalidate],
  );
  const refresh = useCallback(async () => {
    if (busy.current || refreshing.current) return;
    refreshing.current = true;
    const request = begin();
    try {
      const data = await apiRequest<SessionData>("/api/auth/session", {
        signal: request.signal,
      });
      if (generation.current === request.id) {
        if (!data.authenticated)
          throw new ApiClientError("Sesión no válida", 401);
        accept(data.student, data.expiresAt, data.es_admin);
      }
    } catch (error) {
      if (request.signal.aborted || generation.current !== request.id) return;
      clearTimer();
      expires.current = null;
      setStudent(null);
      if (error instanceof ApiClientError && error.status === 401) invalidate();
      else {
        setStatus("error");
        setMessage(
          error instanceof ApiClientError
            ? error.message
            : "No fue posible verificar la sesión. Intenta de nuevo.",
        );
      }
    } finally {
      refreshing.current = false;
    }
  }, [accept, begin, clearTimer, invalidate]);
  const login = useCallback(
    async (email: string, password: string) => {
      if (busy.current) return;
      busy.current = true;
      const request = begin(true);
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
        if (generation.current === request.id && !request.signal.aborted) {
          if (!data.authenticated)
            throw new ApiClientError("Sesión no válida", 401);
          accept(data.student, data.expiresAt, data.es_admin);
          router.replace("/dashboard");
        }
      } catch (error) {
        if (generation.current === request.id)
          setMessage(
            error instanceof ApiClientError
              ? error.message
              : "No fue posible iniciar sesión.",
          );
        throw error;
      } finally {
        busy.current = false;
      }
    },
    [accept, begin, router],
  );
  const logout = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const request = begin();
    try {
      await apiRequest("/api/auth/logout", {
        method: "POST",
        signal: request.signal,
      });
      if (generation.current === request.id) {
        invalidate();
        router.replace("/login");
      }
    } catch (error) {
      if (generation.current === request.id)
        setMessage(
          error instanceof ApiClientError
            ? error.message
            : "No fue posible cerrar la sesión. Intenta de nuevo.",
        );
      throw error;
    } finally {
      busy.current = false;
    }
  }, [begin, invalidate, router]);
  useEffect(() => {
    const unauthorized = () => invalidate();
    const restored = () => {
      if (document.visibilityState !== "visible" || busy.current) return;
      if (expires.current !== null && expires.current * 1000 <= Date.now())
        invalidate();
      else void refresh();
    };
    window.addEventListener("sii:unauthorized", unauthorized);
    document.addEventListener("visibilitychange", restored);
    window.addEventListener("focus", restored);
    const initial = setTimeout(() => {
      void refresh();
    }, 0);
    return () => {
      clearTimeout(initial);
      stopRequest();
      clearTimer();
      window.removeEventListener("sii:unauthorized", unauthorized);
      document.removeEventListener("visibilitychange", restored);
      window.removeEventListener("focus", restored);
    };
  }, [clearTimer, invalidate, refresh, stopRequest]);
  const value = useMemo(
    () => ({ student, esAdmin, status, message, login, logout, refresh }),
    [student, esAdmin, status, message, login, logout, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth requires AuthProvider");
  return value;
}
