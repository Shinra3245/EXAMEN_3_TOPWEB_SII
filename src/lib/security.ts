import "server-only";
import { SESSION_COOKIE_NAME } from "@/config/env";
import { ForbiddenError } from "./errors";

/**
 * Valida que la cabecera Origin coincida estrictamente con el origen del servidor actual.
 * Exigido obligatoriamente para peticiones de mutación de sesión (POST login / POST logout).
 * Rechaza orígenes faltantes o remotos/cruzados.
 */
export function validateSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) {
    throw new ForbiddenError(
      "ORIGIN_HEADER_MISSING",
      "Cabecera Origin requerida para peticiones de autenticación"
    );
  }

  const expectedOrigin = process.env.APP_ORIGIN
    ? new URL(process.env.APP_ORIGIN).origin
    : new URL(req.url).origin;

  // Host and X-Forwarded-* are request input, not a trusted origin allowlist.
  if (origin !== expectedOrigin) {
    throw new ForbiddenError(
      "CROSS_ORIGIN_REQUEST_FORBIDDEN",
      "Origen cruzado no autorizado para mutación de sesión"
    );
  }
}

/**
 * Genera la directiva Set-Cookie para la sesión cifrada
 */
export function buildSessionCookieHeader(
  ciphertext: string,
  maxAgeSeconds: number,
  isSecure = process.env.NODE_ENV === "production"
): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${ciphertext}`,
    `Path=/`,
    `Max-Age=${Math.max(0, maxAgeSeconds)}`,
    `HttpOnly`,
    `SameSite=Lax`,
  ];

  if (isSecure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

/**
 * Genera la directiva Set-Cookie para invalidar y eliminar la sesión
 */
export function buildClearCookieHeader(
  isSecure = process.env.NODE_ENV === "production"
): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    `Path=/`,
    `Max-Age=0`,
    `HttpOnly`,
    `SameSite=Lax`,
  ];

  if (isSecure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

/**
 * Extrae el valor de la cookie sii_session desde las cabeceras de la petición
 */
export function extractSessionCookie(req: Request): string | null {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";").map((c) => c.trim());
  for (const c of cookies) {
    if (c.startsWith(`${SESSION_COOKIE_NAME}=`)) {
      return c.substring(SESSION_COOKIE_NAME.length + 1).trim();
    }
  }

  return null;
}

/**
 * Agrega cabeceras Cache-Control no-store a respuestas que contienen datos privados
 */
export function setPrivateCacheHeaders(headers: Headers): void {
  headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
}
