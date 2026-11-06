import "server-only";
import type { Client } from "pg";
import { withDatabase } from "./db";
import { requireSession } from "./session";
import { AuthenticationError } from "./errors";

/** La identidad del estudiante proviene solo de la cookie cifrada. */
export async function withStudentDatabase<T>(
  req: Request,
  callback: (client: Client) => Promise<T>,
): Promise<T> {
  const session = await requireSession(req);
  return withActorTransaction(session.numero_control, callback);
}

/** Uso interno del servidor; el actor y las consultas no se reciben por HTTP. */
export async function withActorTransaction<T>(
  actor: string,
  callback: (client: Client) => Promise<T>,
): Promise<T> {
  if (!actor || actor.length > 64) {
    throw new AuthenticationError(
      "INVALID_DATA_ACTOR",
      "Identidad de datos inválida",
    );
  }

  return withDatabase(async (client) => {
    await client.query("BEGIN");

    try {
      await client.query("SELECT set_config('app.student_id', $1, true)", [
        actor,
      ]);
      const result = await callback(client);
      await client.query("COMMIT");

      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Se conserva el error original; withDatabase cierra la conexión.
      }

      throw error;
    }
  });
}
