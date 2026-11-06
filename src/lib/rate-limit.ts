import "server-only";
import { requestEnvStorage } from "@/config/env";
import { AppError } from "./errors";

/** Binding de Cloudflare Rate Limiting (ver `ratelimits` en wrangler.jsonc). */
interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

const WINDOW_MS = 60_000;
/** Intentos por minuto desde una misma IP (cubre a quien prueba muchas cuentas). */
const IP_LIMIT = 10;
/** Intentos por minuto contra una misma cuenta (cubre ataques repartidos entre IPs). */
const ACCOUNT_LIMIT = 5;
const MAX_TRACKED_KEYS = 5000;

const memoryHits = new Map<string, number[]>();

/** Solo para pruebas: vacía los contadores en memoria. */
export function resetRateLimitsForTests(): void {
  memoryHits.clear();
}

/**
 * Respaldo para desarrollo local y pruebas, donde no existe el binding de
 * Cloudflare. Ventana deslizante por clave, con tope de claves para que un
 * atacante no pueda agotar la memoria enviando claves distintas.
 */
function allowInMemory(key: string, limit: number): boolean {
  const now = Date.now();
  const recent = (memoryHits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= limit) {
    memoryHits.set(key, recent);
    return false;
  }

  if (!memoryHits.has(key) && memoryHits.size >= MAX_TRACKED_KEYS) {
    // Descarta la clave más antigua (Map conserva el orden de inserción).
    const oldest = memoryHits.keys().next().value;
    if (oldest !== undefined) memoryHits.delete(oldest);
  }

  recent.push(now);
  memoryHits.set(key, recent);
  return true;
}

async function allow(
  bindingName: "LOGIN_IP_LIMITER" | "LOGIN_ACCOUNT_LIMITER",
  key: string,
  fallbackLimit: number,
): Promise<boolean> {
  const binding = requestEnvStorage.getStore()?.[bindingName] as RateLimitBinding | undefined;
  if (binding && typeof binding.limit === "function") {
    const { success } = await binding.limit({ key });
    return success;
  }
  return allowInMemory(`${bindingName}:${key}`, fallbackLimit);
}

/** El correo no se guarda en claro en el limitador: solo su huella SHA-256. */
async function fingerprint(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Cuenta el intento de inicio de sesión y lanza 429 si se excede el límite por
 * IP o por cuenta. Se llama ANTES de contactar al SII, de modo que los intentos
 * bloqueados nunca llegan al servicio institucional.
 */
export async function enforceLoginRateLimit(req: Request, email: string): Promise<void> {
  // Cloudflare agrega esta cabecera en el borde; el cliente no puede fijarla.
  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  const account = await fingerprint(email.trim().toLowerCase());

  const ipAllowed = await allow("LOGIN_IP_LIMITER", ip, IP_LIMIT);
  const accountAllowed = await allow("LOGIN_ACCOUNT_LIMITER", account, ACCOUNT_LIMIT);

  if (!ipAllowed || !accountAllowed) {
    throw new AppError(
      429,
      "TOO_MANY_LOGIN_ATTEMPTS",
      "Demasiados intentos de inicio de sesión. Espera un minuto e inténtalo de nuevo.",
      true,
      { "Retry-After": "60" },
    );
  }
}
