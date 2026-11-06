import "server-only";
import { getSiiBaseUrl, getSiiTimeoutMs } from "@/config/env";
import { readBoundedText } from "./bounded-json";
import {
  AuthenticationError,
  ForbiddenError,
  UpstreamError,
} from "./errors";
import type { SiiEnvelope, SiiLoginResponse } from "@/types/sii";

export const SII_ENDPOINTS = {
  LOGIN: "/api/login",
  STUDENT: "/api/movil/estudiante",
  GRADES: "/api/movil/estudiante/calificaciones",
  KARDEX: "/api/movil/estudiante/kardex",
  SCHEDULE: "/api/movil/estudiante/horarios",
} as const;

type HttpMethod = "GET" | "POST";

interface RequestOptions {
  method?: HttpMethod;
  token?: string;
  body?: unknown;
}

const ALLOWED_METHODS: Record<string, HttpMethod> = {
  [SII_ENDPOINTS.LOGIN]: "POST",
  [SII_ENDPOINTS.STUDENT]: "GET",
  [SII_ENDPOINTS.GRADES]: "GET",
  [SII_ENDPOINTS.KARDEX]: "GET",
  [SII_ENDPOINTS.SCHEDULE]: "GET",
};

export async function requestSii<T = unknown>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  if (!Object.hasOwn(ALLOWED_METHODS, endpoint)) {
    throw new ForbiddenError(
      "DISALLOWED_UPSTREAM_PATH",
      "Ruta institucional no autorizada",
    );
  }

  const expectedMethod = ALLOWED_METHODS[endpoint];
  const method = options.method ?? "GET";
  if (method !== expectedMethod) {
    throw new ForbiddenError(
      "DISALLOWED_UPSTREAM_METHOD",
      "Método institucional no autorizado",
    );
  }

  const baseUrl = getSiiBaseUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getSiiTimeoutMs());

  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (options.token) {
      if (options.token.length > 4096 || /[\r\n]/.test(options.token)) {
        throw new UpstreamError(
          502,
          "INVALID_UPSTREAM_TOKEN",
          "Token institucional inválido",
        );
      }

      headers.Authorization = `Bearer ${options.token}`;
    }

    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(new URL(endpoint, baseUrl), {
      method,
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
      redirect: "manual",
      cache: "no-store",
    });

    if (response.status >= 300 && response.status < 400) {
      throw new UpstreamError(
        502,
        "UPSTREAM_REDIRECT_DISALLOWED",
        "Redirección upstream inesperada rechazada",
      );
    }

    if (response.status === 401) {
      throw new AuthenticationError(
        "UPSTREAM_UNAUTHORIZED",
        "Credenciales o sesión institucional inválidas",
      );
    }

    if (response.status === 403) {
      throw new ForbiddenError(
        "UPSTREAM_FORBIDDEN",
        "Acceso institucional no autorizado",
      );
    }

    if (!response.ok) {
      throw new UpstreamError(
        502,
        "UPSTREAM_HTTP_ERROR",
        "Servicio institucional temporalmente no disponible",
      );
    }

    const responseText = await readBoundedText(response, 1024 * 1024);
    try {
      return JSON.parse(responseText) as T;
    } catch {
      throw new UpstreamError(
        502,
        "UPSTREAM_INVALID_JSON",
        "Respuesta institucional inválida",
      );
    }
  } catch (error) {
    if (
      controller.signal.aborted ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      throw new UpstreamError(
        504,
        "UPSTREAM_TIMEOUT",
        "Tiempo de espera institucional agotado",
      );
    }

    if (
      error instanceof UpstreamError ||
      error instanceof AuthenticationError ||
      error instanceof ForbiddenError
    ) {
      throw error;
    }

    throw new UpstreamError(
      502,
      "UPSTREAM_NETWORK_ERROR",
      "No fue posible contactar el servicio institucional",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function authenticateSii(
  email: string,
  password: string,
): Promise<{ token: string }> {
  const body = await requestSii<SiiLoginResponse>(SII_ENDPOINTS.LOGIN, {
    method: "POST",
    body: { email, password },
  });
  const token = body?.message?.login?.token;

  if (
    body?.flag === false ||
    !token ||
    typeof token !== "string" ||
    token.length > 4096 ||
    /[\r\n]/.test(token)
  ) {
    throw new AuthenticationError(
      "INVALID_CREDENTIALS",
      "No fue posible iniciar sesión institucional",
    );
  }

  return { token };
}

export async function fetchSiiResource<T = unknown>(
  endpoint: string,
  token: string,
): Promise<T> {
  const body = await requestSii<SiiEnvelope<T>>(endpoint, { token });
  const isValidEnvelope =
    body !== null &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    typeof body.flag === "boolean" &&
    typeof body.code === "number" &&
    Object.hasOwn(body, "data");

  if (!isValidEnvelope) {
    throw new UpstreamError(
      502,
      "INVALID_ENVELOPE",
      "Estructura institucional inválida",
    );
  }

  if (body.code === 401) {
    throw new AuthenticationError(
      "UPSTREAM_UNAUTHORIZED",
      "Sesión institucional inválida",
    );
  }

  if (body.code === 403) {
    throw new ForbiddenError(
      "UPSTREAM_FORBIDDEN",
      "Acceso institucional no autorizado",
    );
  }

  if (body.flag === false || body.code >= 400) {
    throw new UpstreamError(
      502,
      "UPSTREAM_FLAG_FALSE",
      "Consulta institucional no completada",
    );
  }

  return body.data;
}
