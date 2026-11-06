import "server-only";
import { Client, type ClientConfig } from "pg";
import {
  getEnvVar,
  requestEnvStorage,
  type RequestEnv,
} from "@/config/env";
import { AppError, ConfigurationError } from "@/lib/errors";

export const SUPABASE_DIRECT_HOST = "db.fegczgleshuzgymtqrkv.supabase.co";
export const SUPABASE_POOLER_PORT = 6543;
export const SUPABASE_PROJECT_USER = "postgres.fegczgleshuzgymtqrkv";
export const SUPABASE_POOLER_DOMAIN = ".pooler.supabase.com";

export interface DatabaseCheckResult {
  connected: boolean;
  read: boolean;
  write: boolean;
  rollback: boolean;
}

/**
 * Valida si el hostname corresponde al dominio oficial de poolers de Supabase (*.pooler.supabase.com).
 * Requiere al menos un subdominio específico (por ejemplo, aws-0-us-west-1.pooler.supabase.com).
 */
export function isSupabasePoolerHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return (
    lower.endsWith(SUPABASE_POOLER_DOMAIN) &&
    lower.length > SUPABASE_POOLER_DOMAIN.length &&
    /^[a-z0-9-]+(\.[a-z0-9-]+)*\.pooler\.supabase\.com$/.test(lower)
  );
}

/**
 * Valida la URL de conexión y construye la configuración de pg.Client.
 * Restricciones estrictas:
 * - Protocolo postgresql: o postgres:
 * - Host: únicamente db.fegczgleshuzgymtqrkv.supabase.co o *.pooler.supabase.com
 * - Pooler: puerto obligatorio 6543 y usuario exacto postgres.fegczgleshuzgymtqrkv
 * - Host directo: puerto 5432
 * - TLS/SSL estricto: rechaza parámetros de query que pretendan anular o degradar TLS
 *   (sslmode=disable/allow/prefer, ssl=false/0, rejectUnauthorized=false/0)
 * - Exige verificación estricta de certificado (rejectUnauthorized: true)
 * - Configura timeouts de conexión y consulta para evitar colgados en Workers
 */
export function parseAndValidateDatabaseUrl(rawUrl: string): ClientConfig {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ConfigurationError("DATABASE_URL no es una URL válida");
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new ConfigurationError(
      "Protocolo de base de datos no permitido. Se requiere postgresql: o postgres:"
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  const isDirect = hostname === SUPABASE_DIRECT_HOST;
  const isPooler = isSupabasePoolerHost(hostname);

  if (!isDirect && !isPooler) {
    throw new ConfigurationError(
      "Host de base de datos no autorizado. Solo se permite db.fegczgleshuzgymtqrkv.supabase.co o *.pooler.supabase.com"
    );
  }

  const username = decodeURIComponent(parsed.username);
  if (!username) {
    throw new ConfigurationError("DATABASE_URL debe incluir usuario");
  }

  const password = decodeURIComponent(parsed.password);
  if (!password) {
    throw new ConfigurationError("DATABASE_URL debe incluir contraseña");
  }

  let port: number;
  if (isPooler) {
    if (parsed.port !== String(SUPABASE_POOLER_PORT)) {
      throw new ConfigurationError(
        `Puerto del pooler de Supabase inválido. Debe ser ${SUPABASE_POOLER_PORT}`
      );
    }
    port = SUPABASE_POOLER_PORT;

    if (username !== SUPABASE_PROJECT_USER) {
      throw new ConfigurationError(
        `Usuario del pooler inválido. Debe ser exactamente el usuario del proyecto (${SUPABASE_PROJECT_USER})`
      );
    }
  } else {
    port = parsed.port ? parseInt(parsed.port, 10) : 5432;
    if (isNaN(port) || (parsed.port && parsed.port !== "5432")) {
      throw new ConfigurationError(
        "Puerto del host directo de Supabase debe ser 5432"
      );
    }
  }

  // Rechazar configuraciones de query que anulen TLS
  const searchParams = parsed.searchParams;
  const sslmode = searchParams.get("sslmode")?.toLowerCase();
  if (
    sslmode &&
    ["disable", "allow", "prefer", "false", "0", "no", "off"].includes(sslmode)
  ) {
    throw new ConfigurationError(
      "Configuración sslmode no permitida. Se requiere verificación TLS estricta"
    );
  }

  const ssl = searchParams.get("ssl")?.toLowerCase();
  if (ssl && ["false", "0", "no", "off", "disable"].includes(ssl)) {
    throw new ConfigurationError(
      "Configuración ssl no permitida. Se requiere verificación TLS estricta"
    );
  }

  const rejectUnauthorized = searchParams
    .get("rejectUnauthorized")
    ?.toLowerCase();
  if (
    rejectUnauthorized &&
    ["false", "0", "no", "off"].includes(rejectUnauthorized)
  ) {
    throw new ConfigurationError(
      "rejectUnauthorized=false no permitido. Se requiere TLS estricto"
    );
  }

  if (parsed.hash || (parsed.pathname && parsed.pathname !== "/postgres")) {
    throw new ConfigurationError("Base de datos no autorizada");
  }

  const database = parsed.pathname
    ? parsed.pathname.replace(/^\//, "") || "postgres"
    : "postgres";

  return {
    host: hostname,
    port,
    user: username,
    password,
    database,
    ssl: {
      rejectUnauthorized: true,
    },
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
  };
}

/**
 * Crea un cliente pg individual para una operación específica.
 * No utiliza pool global para compatibilidad con el ciclo de vida de Cloudflare Workers.
 */
export function createDatabaseClient(env?: RequestEnv): Client {
  const context = env ?? requestEnvStorage.getStore();
  if (context?.HYPERDRIVE) {
    // Binding de confianza de Cloudflare; Hyperdrive verifica TLS con el origen.
    // Este salto usa el transporte interno administrado por Workers.
    const connectionString = context.HYPERDRIVE.connectionString;
    if (typeof connectionString !== "string" || !connectionString) {
      throw new ConfigurationError("Binding Hyperdrive inválido");
    }

    return new Client({
      connectionString,
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
    });
  }
  const rawUrl =
    env?.DATABASE_URL !== undefined && env.DATABASE_URL !== null
      ? String(env.DATABASE_URL).trim()
      : getEnvVar("DATABASE_URL")?.trim();

  if (!rawUrl) {
    throw new ConfigurationError("DATABASE_URL no configurada en el servidor");
  }

  const clientConfig = parseAndValidateDatabaseUrl(rawUrl);
  return new Client(clientConfig);
}

/**
 * Ejecuta una operación de base de datos con un cliente individual.
 * Garantiza timeouts, cierre seguro en finally y supresión de credenciales en errores.
 * Compatible con Cloudflare Workers (nodejs_compat) y el modo de transacción del pooler de Supabase
 * (PgBouncer/Supavisor, sin uso de prepared statements / named statements).
 */
export async function withDatabase<T>(
  callback: (client: Client) => Promise<T>,
  env?: RequestEnv
): Promise<T> {
  const client = createDatabaseClient(env);
  try {
    await client.connect();
    return await callback(client);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    const safeCodes = new Set([
      "42501",
      "28P01",
      "28000",
      "CERT_HAS_EXPIRED",
      "SELF_SIGNED_CERT_IN_CHAIN",
      "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
      "DEPTH_ZERO_SELF_SIGNED_CERT",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "ENOTFOUND",
      "ERR_TLS_CERT_ALTNAME_INVALID",
    ]);
    if (safeCodes.has(code)) {
      throw new AppError(
        503,
        `DATABASE_${code}`,
        "No se pudo establecer la conexión segura con la base de datos",
      );
    }

    const message = error instanceof Error ? error.message : "";
    const categories = [
      ["password authentication", "AUTH"],
      ["Tenant", "TENANT"],
      ["self-signed", "CERTIFICATE"],
      ["SASL", "SASL"],
      ["SSL", "SSL"],
      ["TLS", "TLS"],
      ["Connection terminated", "TERMINATED"],
      ["timeout", "TIMEOUT"],
      ["not implemented", "UNSUPPORTED"],
      ["Cloudflare", "RUNTIME"],
      ["connect", "CONNECT"],
    ];
    const lowerCaseMessage = message.toLowerCase();
    const category = categories.find(([pattern]) =>
      lowerCaseMessage.includes(pattern.toLowerCase()),
    );
    if (category) {
      throw new AppError(
        503,
        `DATABASE_${category[1]}`,
        "La conexión de base de datos no se completó",
      );
    }
    // No registrar ni emitir credenciales, URIs ni trazas internas
    throw new AppError(
      503,
      "DATABASE_OPERATION_ERROR",
      "Error en la operación de base de datos"
    );
  } finally {
    try {
      await client.end();
    } catch {
      // Ignorar errores durante el cierre para preservar la excepción principal
    }
  }
}

/**
 * Diagnóstico de base de datos con consultas SQL fijas:
 * 1. Lectura: SELECT 1 AS probe
 * 2. Transacción temporal: BEGIN, CREATE TEMP TABLE pg_temp.connection_probe, INSERT, SELECT, ROLLBACK
 * 3. Comprobación de que la tabla temporal fue revertida sin tocar tablas persistentes
 *
 * NOTA IMPORTANTE: La prueba realizada mediante pg_temp.connection_probe
 * verifica la capacidad transaccional y de DDL/DML temporal de la sesión;
 * NO acredita persistencia permanente en disco ni sobre tablas de negocio.
 */
export async function checkDatabase(env?: RequestEnv): Promise<DatabaseCheckResult> {
  return withDatabase(async (client) => {
    // 1. Conexión establecida
    const connected = true;

    // 2. Comprobación de lectura fija (sin named statements)
    const readResult = await client.query("SELECT 1 AS probe");
    const read =
      Array.isArray(readResult.rows) &&
      readResult.rows.length > 0 &&
      (readResult.rows[0].probe === 1 || readResult.rows[0]["?column?"] === 1);

    // 3. Comprobación de escritura y reversión dentro de una transacción
    let write = false;
    let rollback = false;

    await client.query("BEGIN");
    try {
      await client.query(
        "CREATE TEMP TABLE pg_temp.connection_probe (id int primary key, val text)"
      );
      await client.query(
        "INSERT INTO pg_temp.connection_probe (id, val) VALUES (1, 'probe')"
      );
      const writeResult = await client.query(
        "SELECT val FROM pg_temp.connection_probe WHERE id = 1"
      );
      write =
        Array.isArray(writeResult.rows) &&
        writeResult.rows.length > 0 &&
        writeResult.rows[0].val === "probe";
    } finally {
      try {
        await client.query("ROLLBACK");
        const verifyResult = await client.query(
          "SELECT to_regclass('pg_temp.connection_probe') AS tbl"
        );
        rollback =
          Array.isArray(verifyResult.rows) &&
          verifyResult.rows.length > 0 &&
          verifyResult.rows[0].tbl === null;
      } catch {
        rollback = false;
      }
    }

    return {
      connected,
      read,
      write,
      rollback,
    };
  }, env);
}
