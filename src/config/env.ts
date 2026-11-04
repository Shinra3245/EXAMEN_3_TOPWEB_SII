import "server-only";
import { ConfigurationError } from "@/lib/errors";

export const ALLOWED_SII_ORIGIN = "https://sii.celaya.tecnm.mx";
export const DEFAULT_SII_TIMEOUT_MS = 8000;
export const MAX_SESSION_DURATION_SECONDS = 3600; // Máximo 1 hora
export const SESSION_COOKIE_NAME = "sii_session";

/**
 * Obtiene y valida la clave secreta de 32 bytes para cifrado AES-256-GCM.
 * Si falta o no cumple con exactamente 32 bytes, lanza ConfigurationError (HTTP 503).
 */
export function getSessionSecretBytes(): Uint8Array {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) {
    throw new ConfigurationError("SESSION_SECRET no configurado en el servidor");
  }

  // Si es una cadena hexadecimal de 64 caracteres
  if (/^[0-9a-fA-F]{64}$/.test(secret)) {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = parseInt(secret.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }

  // Si es una cadena utf-8 directa de exactamente 32 bytes
  const encoded = new TextEncoder().encode(secret);
  if (encoded.length === 32) {
    return encoded;
  }

  throw new ConfigurationError(
    "SESSION_SECRET debe tener exactamente 32 bytes (64 caracteres hex o 32 caracteres utf-8)"
  );
}

/**
 * Retorna la URL base de SII, garantizando que el origen sea estrictamente https://sii.celaya.tecnm.mx.
 */
export function getSiiBaseUrl(): string {
  const custom = process.env.SII_BASE_URL?.trim();
  if (custom) {
    let parsed: URL;
    try {
      parsed = new URL(custom);
    } catch {
      throw new ConfigurationError("SII_BASE_URL no es una URL válida");
    }

    if (parsed.origin !== ALLOWED_SII_ORIGIN || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      throw new ConfigurationError(
        "Origen SII no permitido"
      );
    }
    return ALLOWED_SII_ORIGIN;
  }
  return ALLOWED_SII_ORIGIN;
}

/**
 * Retorna el timeout en ms para peticiones SII.
 */
export function getSiiTimeoutMs(): number {
  const raw = process.env.SII_TIMEOUT_MS;
  if (raw) {
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 30000) {
      return parsed;
    }
  }
  return DEFAULT_SII_TIMEOUT_MS;
}
