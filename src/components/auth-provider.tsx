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

  // Generación lógica de solicitudes: cada nueva petición o invalidación la
  // incrementa, permitiendo descartar respuestas de peticiones ya obsoletas
  // aunque no hayan sido abortadas (por ejemplo, si llegaron tarde).
  const requestGeneration = useRef(0);
  // Controlador de la última petición en curso; se aborta al iniciar otra o al
  // invalidar la sesión para evitar que respuestas viejas sobrescriban el estado.
  const requestController = useRef<AbortController | null>(null);
  // Evita solapamientos entre login/logout (operaciones que mutan la sesión).
  const isMutating = useRef(false);
  // Evita refresh concurrentes entre sí.
  const isRefreshing = useRef(false);
  // Almacena el id del estudiante activo para detectar cambios de identidad.
  const activeStudentId = useRef<string | null>(null);
  // Expiración absoluta de la sesión (en segundos, tal como la entrega el backend).
  const sessionExpiresAt = useRef<number | null>(null);
  // Temporizador encargado de invalidar la sesión automáticamente al expirar.
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
    // Avanza la época global del cliente API para descartar respuestas iniciadas
    // antes de invalidar esta sesión.
    requestGeneration.current++;
    advanceApiEpoch();
    requestController.current?.abort();
    clearExpirationTimer();
    sessionExpiresAt.current = null;
    activeStudentId.current = null;
    setStudent(null);
    setEsAdmin(false);
    setStatus("unauthenticated");
    setMessage(null);
  }, [clearExpirationTimer]);

  const beginRequest = useCallback((newSession = false) => {
    // Al iniciar una nueva petición se incrementa la generación y se aborta la
    // anterior; así solo la última petición podrá aplicar su resultado.
    requestGeneration.current++;
    // Un login abre una nueva sesión y hace que el cliente API descarte respuestas
    // iniciadas bajo la sesión anterior.
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
    (profile: StudentProfileDTO, expiration: number, isAdmin?: boolean) => {
      // Validación defensiva: perfil con identificador, expiración numérica y
      // todavía vigente; se compara en milisegundos contra el reloj local.
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

      // Si cambia el estudiante activo, las respuestas pendientes de la sesión
      // anterior dejan de ser válidas para el cliente API.
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
      setEsAdmin(Boolean(isAdmin));
      setStatus("authenticated");
      setMessage(null);

      // Invalida la sesión cuando se alcance el tiempo de expiración entregado
      // por el servidor (con un tope defensivo de 24 horas para el temporizador).
      expirationTimer.current = setTimeout(
        invalidateSession,
        Math.min(expiration * 1000 - Date.now(), 86400000),
      );
    },
    [clearExpirationTimer, invalidateSession],
  );

  const refresh = useCallback(async () => {
    // Se evita consultar si hay una mutación en curso (login/logout) o si ya
    // hay un refresh ejecutándose.
    if (isMutating.current || isRefreshing.current) return;

    isRefreshing.current = true;
    const request = beginRequest();

    try {
      const data = await apiRequest<SessionData>("/api/auth/session", {
        signal: request.signal,
      });

      // Solo la respuesta correspondiente a la última petición puede modificar
      // el estado de la aplicación.
      if (requestGeneration.current === request.id) {
        if (!data.authenticated) {
          throw new ApiClientError("Sesión no válida", 401);
        }

        acceptSession(data.student, data.expiresAt, data.es_admin);
      }
    } catch (error) {
      // Las peticiones abortadas o ya superadas no alteran el estado.
      if (
        request.signal.aborted ||
        requestGeneration.current !== request.id
      ) {
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
  }, [acceptSession, beginRequest, clearExpirationTimer, invalidateSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      // Un login concurrente con otro login/logout se descarta.
      if (isMutating.current) return;

      isMutating.current = true;
      // Login inicia una nueva sesión: se avanza la época del API.
      const request = beginRequest(true);
      setMessage(null);

      try {
        await apiRequest<LoginData>("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
          signal: request.signal,
        });

        // Tras el login se consulta la sesión para obtener el perfil y la
        // expiración canónicos desde el backend (no se confía en el login).
        const data = await apiRequest<SessionData>("/api/auth/session", {
          signal: request.signal,
        });

        // Se verifica generación y aborto antes de aplicar el resultado para
        // evitar redirecciones o estados de una petición ya superada.
        if (requestGeneration.current === request.id && !request.signal.aborted) {
          if (!data.authenticated) {
            throw new ApiClientError("Sesión no válida", 401);
          }

          acceptSession(data.student, data.expiresAt, data.es_admin);
          router.replace("/dashboard");
        }
      } catch (error) {
        // Solo se publica el mensaje si esta sigue siendo la petición vigente.
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

      // Solo se limpia el estado local y se redirige si la petición es vigente;
      // si otra operación la superó, se deja que esa determine el nuevo estado.
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
    // Evento global emitido por el cliente API ante un 401; invalida la sesión
    // de forma centralizada sin que cada componente deba manejarlo.
    const handleUnauthorized = () => invalidateSession();

    // Revalidación bajo demanda: al volver a la pestaña o recibir foco se
    // comprueba primero la expiración local (barato) y, si sigue vigente, se
    // consulta al backend para confirmar que la sesión sigue activa.
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

    // Inicia la verificación inicial en el siguiente turno del event loop.
    const initialRefresh = setTimeout(() => {
      void refresh();
    }, 0);

    return () => {
      clearTimeout(initialRefresh);
      // Limpieza: aborta peticiones en curso y libera el temporizador de
      // expiración, además de remover los listeners globales.
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
    () => ({ student, esAdmin, status, message, login, logout, refresh }),
    [student, esAdmin, status, message, login, logout, refresh],
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
