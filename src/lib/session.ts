import "server-only";
import { extractSessionCookie } from "./security";
import { decryptSession } from "./crypto";
import { AuthenticationError } from "./errors";
import type { SessionPayload } from "@/types/auth";

/** Comprueba la presencia, integridad y vigencia de la sesión recibida. */
export async function requireSession(req: Request): Promise<SessionPayload> {
  const cookieValue = extractSessionCookie(req);
  if (!cookieValue) {
    throw new AuthenticationError(
      "SESSION_NOT_FOUND",
      "No se encontró sesión activa. Inicie sesión para continuar",
    );
  }

  const payload = await decryptSession(cookieValue);
  const hasStudentId =
    typeof payload?.numero_control === "string" &&
    payload.numero_control.trim().length > 0;

  if (!payload || !hasStudentId) {
    throw new AuthenticationError(
      "SESSION_INVALID_OR_EXPIRED",
      "La sesión no es válida, ha sido alterada o ha expirado",
    );
  }

  return payload;
}
