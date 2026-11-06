import "server-only";
import {
  getSessionSecretBytes,
  MAX_SESSION_DURATION_SECONDS,
} from "@/config/env";
import type { SessionPayload } from "@/types/auth";
import { AuthenticationError } from "./errors";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";

  for (let index = 0; index < bytes.byteLength; index++) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function getCryptoKey(customSecretBytes?: Uint8Array): Promise<CryptoKey> {
  const secretBytes = customSecretBytes ?? getSessionSecretBytes();

  return crypto.subtle.importKey(
    "raw",
    secretBytes as unknown as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Cifra la sesión con AES-GCM y empaqueta el IV junto al texto cifrado.
 * Formato: IV de 12 bytes + texto cifrado y etiqueta de autenticación, en Base64.
 */
export async function encryptSession(
  payload: SessionPayload,
  customSecretBytes?: Uint8Array,
): Promise<string> {
  const key = await getCryptoKey(customSecretBytes);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedPayload = new TextEncoder().encode(JSON.stringify(payload));

  const encryptedPayload = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encodedPayload,
  );

  const encryptedBytes = new Uint8Array(encryptedPayload);
  const combined = new Uint8Array(iv.length + encryptedBytes.length);
  combined.set(iv, 0);
  combined.set(encryptedBytes, iv.length);

  return bytesToBase64(combined);
}

/** Devuelve null si la cookie no es válida, fue alterada o ya expiró. */
export async function decryptSession(
  cookieValue: string,
  customSecretBytes?: Uint8Array,
): Promise<SessionPayload | null> {
  if (!cookieValue || typeof cookieValue !== "string") return null;

  const key = await getCryptoKey(customSecretBytes);
  if (cookieValue.length > 4096) return null;

  try {
    const combined = base64ToBytes(cookieValue);

    // El IV ocupa 12 bytes y la etiqueta de autenticación ocupa 16.
    if (combined.length < 28) return null;

    const iv = combined.slice(0, 12);
    const encryptedPayload = combined.slice(12);
    const decryptedPayload = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encryptedPayload,
    );

    const decodedPayload = new TextDecoder().decode(decryptedPayload);
    const payload = JSON.parse(decodedPayload) as SessionPayload;
    const hasValidToken =
      payload && typeof payload.token === "string" && payload.token.length > 0;
    const hasValidExpiration =
      payload && typeof payload.exp === "number" && Number.isFinite(payload.exp);

    if (!hasValidToken || !hasValidExpiration) return null;

    const nowInSeconds = Math.floor(Date.now() / 1000);
    if (nowInSeconds >= payload.exp) return null;

    return payload;
  } catch {
    return null;
  }
}

/** Decodifica un JWT sin validar su firma; el resultado no es de confianza. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  if (!token || typeof token !== "string") return null;

  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) {
      base64 += "=";
    }

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }

    const decodedPayload = new TextDecoder().decode(bytes);
    return JSON.parse(decodedPayload);
  } catch {
    return null;
  }
}

/** Limita la duración local a la vigencia del token institucional y al máximo configurado. */
export function calculateSessionExpiration(siiExp?: number): number {
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const maximumExpiration = nowInSeconds + MAX_SESSION_DURATION_SECONDS;

  if (
    typeof siiExp !== "number" ||
    !Number.isFinite(siiExp) ||
    siiExp <= nowInSeconds
  ) {
    throw new AuthenticationError(
      "INVALID_UPSTREAM_EXPIRATION",
      "La sesión institucional no tiene una vigencia válida",
    );
  }

  return Math.min(Math.floor(siiExp), maximumExpiration);
}
