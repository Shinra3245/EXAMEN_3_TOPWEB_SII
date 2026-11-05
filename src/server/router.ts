import "server-only";
import { runWithEnv, RequestEnv } from "@/config/env";
import {
  handleHealth,
  handleLogin,
  handleSession,
  handleLogout,
  handleStudent,
  handleGrades,
  handleKardex,
  handleSchedule,
} from "./handlers";

type HttpMethod = "GET" | "POST";

interface RouteDefinition {
  allowedMethod: HttpMethod;
  handler: (req: Request) => Promise<Response>;
}

export const API_ROUTES: Record<string, RouteDefinition> = {
  "/api/health": { allowedMethod: "GET", handler: handleHealth },
  "/api/auth/login": { allowedMethod: "POST", handler: handleLogin },
  "/api/auth/session": { allowedMethod: "GET", handler: handleSession },
  "/api/auth/logout": { allowedMethod: "POST", handler: handleLogout },
  "/api/student": { allowedMethod: "GET", handler: handleStudent },
  "/api/grades": { allowedMethod: "GET", handler: handleGrades },
  "/api/kardex": { allowedMethod: "GET", handler: handleKardex },
  "/api/schedule": { allowedMethod: "GET", handler: handleSchedule },
};

/**
 * Enruta peticiones que inician con /api/* directamente en el runtime del Worker
 * sin pasar por Next.js / OpenNext, reduciendo overhead de CPU a Web Request/Response puro.
 */
export async function routeApiRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const route = API_ROUTES[url.pathname];

  if (!route) {
    // 404 para cualquier ruta /api/* no registrada (excluida explícitamente del fallback Next)
    return Response.json(
      {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Ruta de API no encontrada",
        },
      },
      {
        status: 404,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }

  if (req.method !== route.allowedMethod) {
    // 405 Method Not Allowed con cabecera Allow y Cache-Control: no-store
    return Response.json(
      {
        success: false,
        error: {
          code: "METHOD_NOT_ALLOWED",
          message: `Método ${req.method} no permitido`,
        },
      },
      {
        status: 405,
        headers: {
          Allow: route.allowedMethod,
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }

  return route.handler(req);
}

/**
 * Wrapper de ejecución que asocia el contexto AsyncLocalStorage del Worker
 * para la petición actual de forma aislada y no concurrente.
 */
export async function handleWorkerApi(
  req: Request,
  env?: RequestEnv
): Promise<Response> {
  return runWithEnv(env, () => routeApiRequest(req));
}
