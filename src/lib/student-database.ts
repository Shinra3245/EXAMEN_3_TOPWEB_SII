import "server-only";
import type { Client } from "pg";
import { withDatabase } from "./db";
import { requireSession } from "./session";
import { AuthenticationError } from "./errors";
import { isAdministrator } from "@/config/env";

export interface ActorTransactionOptions {
  isAdmin?: boolean;
}

/** Identidad exclusivamente de la cookie cifrada; nunca de URL/cuerpo/cabeceras del usuario. */
export async function withStudentDatabase<T>(
  req: Request,
  callback: (client: Client) => Promise<T>,
  options?: ActorTransactionOptions
): Promise<T> {
  const session = await requireSession(req);
  const isAdmin = options?.isAdmin ?? isAdministrator(session.numero_control);
  return withActorTransaction(session.numero_control, callback, { isAdmin });
}

/** Uso interno de servidor/diagnóstico sintético. No exponer actor ni SQL como entrada HTTP. */
export async function withActorTransaction<T>(
  actor: string,
  callback: (client: Client) => Promise<T>,
  options?: ActorTransactionOptions | boolean
): Promise<T> {
  if (!actor || actor.length > 64)
    throw new AuthenticationError("INVALID_DATA_ACTOR", "Identidad de datos inválida");

  const isAdmin =
    typeof options === "boolean" ? options : Boolean(options?.isAdmin);

  return withDatabase(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query("SELECT set_config('app.student_id', $1, true)", [actor]);
      await client.query("SELECT set_config('app.is_admin', $1, true)", [
        isAdmin ? "true" : "false",
      ]);
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* preservar error original; finally de withDatabase cierra conexión */
      }
      throw error;
    }
  });
}
