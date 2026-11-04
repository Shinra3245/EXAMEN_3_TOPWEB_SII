import "server-only";
import { getSessionSecretBytes, MAX_SESSION_DURATION_SECONDS } from "@/config/env";
import { AuthenticationError } from "./errors";
import { SessionPayload } from "@/types/auth";

/**
 * Convierte Uint8Array a cadena Base64
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convierte cadena Base64 a Uint8Array
 */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Importa la clave secreta de 32 bytes para WebCrypto AES-GCM
 */
async function getCryptoKey(customSecretBytes?: Uint8Array): Promise<CryptoKey> {
  const secretBytes = customSecretBytes ?? getSessionSecretBytes();
  return crypto.subtle.importKey(
    "raw",
    secretBytes as unknown as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Cifra la carga útil de la sesión utilizando AES-256-GCM y WebCrypto
 * Empaqueta: IV (12 bytes) + Ciphertext + Auth Tag (16 bytes) en Base64
 */
export async function encryptSession(
  payload: SessionPayload,
  customSecretBytes?: Uint8Array
): Promise<string> {
  const key = await getCryptoKey(customSecretBytes);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedData = new TextEncoder().encode(JSON.stringify(payload));

  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    encodedData
  );

  const encryptedBytes = new Uint8Array(encryptedBuffer);
  const combined = new Uint8Array(iv.length + encryptedBytes.length);
  combined.set(iv, 0);
  combined.set(encryptedBytes, iv.length);

  return bytesToBase64(combined);
}

/**
 * Descifra la cookie de sesión y verifica integridad contra alteraciones (tampering)
 * Retorna null si la cookie está alterada o la sesión ha expirado
 */
export async function decryptSession(
  cookieValue: string,
  customSecretBytes?: Uint8Array
): Promise<SessionPayload | null> {
  if (!cookieValue || typeof cookieValue !== "string") {
    return null;
  }

  const key = await getCryptoKey(customSecretBytes);
  if (cookieValue.length > 4096) return null;
  try {
    const combined = base64ToBytes(cookieValue);
    // Debe tener al menos 12 bytes de IV + 16 bytes de tag de autenticación
    if (combined.length < 28) {
      return null;
    }

    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
      },
      key,
      ciphertext
    );

    const decodedText = new TextDecoder().decode(decryptedBuffer);
    const payload = JSON.parse(decodedText) as SessionPayload;

    if (!payload || typeof payload.token !== "string" || !payload.token || typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
      return null;
    }

    // Verificar expiración
    const nowInSeconds = Math.floor(Date.now() / 1000);
    if (nowInSeconds >= payload.exp) {
      return null;
    }

    return payload;
  } catch {
    // Falla de integridad (tampering), formato inválido o llave errónea
    return null;
  }
}

/**
 * Decodifica el payload de un JWT sin validar la firma ni confiar en el cliente.
 * Se usa exclusivamente para extraer el campo 'exp' de diagnóstico/expiración.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  if (!token || typeof token !== "string") {
    return null;
  }

  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }

    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) {
      b64 += "=";
    }

    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const decoded = new TextDecoder().decode(bytes);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Calcula la expiración de la sesión acotada al exp del token SII
 * y con un límite máximo absoluto de 1 hora (3600 segundos).
 */
export function calculateSessionExpiration(siiExp?: number): number {
  const now = Math.floor(Date.now() / 1000);
  const maxExp = now + MAX_SESSION_DURATION_SECONDS;

  if (typeof siiExp !== "number" || !Number.isFinite(siiExp) || siiExp <= now) {
    throw new AuthenticationError("INVALID_UPSTREAM_EXPIRATION", "La sesión institucional no tiene una vigencia válida");
  }
  return Math.min(Math.floor(siiExp), maxExp);
}
