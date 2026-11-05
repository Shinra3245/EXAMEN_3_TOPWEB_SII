import "server-only";
import { extractSessionCookie } from "./security";
import { decryptSession } from "./crypto";
import { AuthenticationError } from "./errors";
import { SessionPayload } from "@/types/auth";

/**
 * Valida la existencia, integridad criptográfica y expiración de la sesión en la petición entrante.
 * Lanza AuthenticationError si no existe cookie o no es válida.
 * Lanza ConfigurationError (503) si SESSION_SECRET no está configurado.
 */
export async function requireSession(req: Request): Promise<SessionPayload> {
  const cookieValue = extractSessionCookie(req);
  if (!cookieValue) {
    throw new AuthenticationError(
      "SESSION_NOT_FOUND",
      "No se encontró sesión activa. Inicie sesión para continuar"
    );
  }

  const payload = await decryptSession(cookieValue);
  if (!payload || typeof payload.numero_control !== "string" || !payload.numero_control.trim()) {
    throw new AuthenticationError(
      "SESSION_INVALID_OR_EXPIRED",
      "La sesión no es válida, ha sido alterada o ha expirado"
    );
  }

  return payload;
}
