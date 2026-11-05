import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  parseAndValidateDatabaseUrl,
  createDatabaseClient,
  withDatabase,
  checkDatabase,
  SUPABASE_DIRECT_HOST,
  SUPABASE_POOLER_PORT,
  SUPABASE_PROJECT_USER,
} from "@/lib/db";
import { POST as databaseCheckRoute } from "@/app/api/internal/database-check/route";
import { handleDatabaseCheck } from "@/server/handlers";
import { routeApiRequest } from "@/server/router";
import worker from "@/worker";
import { RequestEnv } from "@/config/env";
import { Client } from "pg";

const mockConnect = vi.fn();
const mockQuery = vi.fn();
const mockEnd = vi.fn();

vi.mock("pg", () => {
  class MockClient {
    public config: unknown;
    constructor(config: unknown) {
      this.config = config;
    }
    connect = mockConnect;
    query = mockQuery;
    end = mockEnd;
  }
  return {
    Client: MockClient,
  };
});

describe("Supabase Database Helper & Protected Diagnostic Check", () => {
  const validPoolerUrl = `postgresql://${SUPABASE_PROJECT_USER}:secretpassword@aws-0-us-west-1.pooler.supabase.com:${SUPABASE_POOLER_PORT}/postgres`;
  const validDirectUrl = `postgresql://postgres:secretpassword@${SUPABASE_DIRECT_HOST}:5432/postgres`;
  const testToken = "valid-check-token-1234567890abcdef";
  const base = "https://portal.example.invalid";

  const getFutureExpiry = (secondsAhead = 600) =>
    Math.floor(Date.now() / 1000) + secondsAhead;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue(undefined);
    mockEnd.mockResolvedValue(undefined);
    mockQuery.mockImplementation(async (sql: string | { text: string }) => {
      const q = typeof sql === "string" ? sql : sql.text;
      if (q === "SELECT 1 AS probe") {
        return { rows: [{ probe: 1 }] };
      }
      if (q === "BEGIN" || q === "ROLLBACK") {
        return { rows: [] };
      }
      if (q.startsWith("CREATE TEMP TABLE")) {
        return { rows: [] };
      }
      if (q.startsWith("INSERT INTO pg_temp.connection_probe")) {
        return { rows: [] };
      }
      if (q === "SELECT val FROM pg_temp.connection_probe WHERE id = 1") {
        return { rows: [{ val: "probe" }] };
      }
      if (q === "SELECT to_regclass('pg_temp.connection_probe') AS tbl") {
        return { rows: [{ tbl: null }] };
      }
      return { rows: [] };
    });

    vi.stubEnv("DATABASE_URL", validPoolerUrl);
    vi.stubEnv("DATABASE_CHECK_TOKEN", testToken);
    vi.stubEnv("DATABASE_CHECK_EXPIRES_AT", String(getFutureExpiry(600)));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("1. Validación estricta de URL y configuración Supabase", () => {
    it("acepta host directo válido con puerto 5432 y TLS estricto", () => {
      const config = parseAndValidateDatabaseUrl(validDirectUrl);
      expect(config.host).toBe(SUPABASE_DIRECT_HOST);
      expect(config.port).toBe(5432);
      expect(config.user).toBe("postgres");
      expect(config.password).toBe("secretpassword");
      expect(config.ssl).toEqual({ rejectUnauthorized: true });
      expect(config.connectionTimeoutMillis).toBe(5000);
      expect(config.statement_timeout).toBeUndefined();
      expect(config.query_timeout).toBe(5000);
    });

    it("acepta pooler oficial con puerto 6543 y usuario exacto del proyecto", () => {
      const config = parseAndValidateDatabaseUrl(validPoolerUrl);
      expect(config.host).toBe("aws-0-us-west-1.pooler.supabase.com");
      expect(config.port).toBe(SUPABASE_POOLER_PORT);
      expect(config.user).toBe(SUPABASE_PROJECT_USER);
      expect(config.password).toBe("secretpassword");
      expect(config.ssl).toEqual({ rejectUnauthorized: true });
    });

    it("rechaza host ajeno no autorizado", () => {
      expect(() =>
        parseAndValidateDatabaseUrl(
          "postgresql://postgres:pass@db.attacker.com:5432/postgres"
        )
      ).toThrow(/Host de base de datos no autorizado/);
    });

    it("rechaza pooler con puerto incorrecto (ej. 5432 en lugar de 6543)", () => {
      expect(() =>
        parseAndValidateDatabaseUrl(
          `postgresql://${SUPABASE_PROJECT_USER}:pass@aws-0-us-west-1.pooler.supabase.com:5432/postgres`
        )
      ).toThrow(/Puerto del pooler de Supabase inválido/);
    });

    it("rechaza pooler con usuario distinto al exacto del proyecto", () => {
      expect(() =>
        parseAndValidateDatabaseUrl(
          "postgresql://postgres:pass@aws-0-us-west-1.pooler.supabase.com:6543/postgres"
        )
      ).toThrow(/Usuario del pooler inválido/);
    });

    it("rechaza protocolos no permitidos (ej. mysql:, http:)", () => {
      expect(() =>
        parseAndValidateDatabaseUrl(
          "mysql://postgres:pass@aws-0-us-west-1.pooler.supabase.com:6543/postgres"
        )
      ).toThrow(/Protocolo de base de datos no permitido/);
    });

    it.each([
      ["?sslmode=disable", /sslmode no permitida/],
      ["?sslmode=allow", /sslmode no permitida/],
      ["?sslmode=prefer", /sslmode no permitida/],
      ["?ssl=false", /ssl no permitida/],
      ["?ssl=0", /ssl no permitida/],
      ["?rejectUnauthorized=false", /rejectUnauthorized=false no permitido/],
      ["?rejectUnauthorized=0", /rejectUnauthorized=false no permitido/],
    ])("rechaza parámetro de query que intenta degradar TLS: %s", (query, expectedError) => {
      const badUrl = `${validPoolerUrl}${query}`;
      expect(() => parseAndValidateDatabaseUrl(badUrl)).toThrow(expectedError);
    });

    it("lanza ConfigurationError cuando DATABASE_URL está ausente", () => {
      vi.stubEnv("DATABASE_URL", "");
      expect(() => createDatabaseClient()).toThrow(/DATABASE_URL no configurada/);
    });
  });

  describe("2. Helper withDatabase: un cliente por operación y cierre en finally", () => {
    it("conecta, ejecuta callback y cierra el cliente en finally", async () => {
      const result = await withDatabase(async (client) => {
        expect(mockConnect).toHaveBeenCalledTimes(1);
        return "operation_success";
      });

      expect(result).toBe("operation_success");
      expect(mockEnd).toHaveBeenCalledTimes(1);
    });

    it("garantiza cierre del cliente en finally cuando el callback falla y no expone credenciales", async () => {
      mockQuery.mockRejectedValueOnce(new Error("fatal raw db failure password=123"));

      await expect(
        withDatabase(async (client) => {
          await client.query("SELECT * FROM fail");
        })
      ).rejects.toThrow("Error en la operación de base de datos");

      expect(mockEnd).toHaveBeenCalledTimes(1);
    });

    it("garantiza cierre del cliente en finally cuando connect falla", async () => {
      mockConnect.mockRejectedValueOnce(new Error("Connection timeout"));

      await expect(
        withDatabase(async () => {
          return "should not be reached";
        })
      ).rejects.toThrow("La conexión de base de datos no se completó");

      expect(mockEnd).toHaveBeenCalledTimes(1);
    });
  });

  describe("3. Diagnóstico protegido: validación de Token y Expiry ANTES de tocar DB", () => {
    const postCheck = (headers: Record<string, string> = {}) =>
      new NextRequest(`${base}/api/internal/database-check`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...headers,
        },
      });

    it("responde 404 sin tocar DB cuando DATABASE_CHECK_TOKEN no está en env", async () => {
      vi.stubEnv("DATABASE_CHECK_TOKEN", "");
      const res = await databaseCheckRoute(
        postCheck({ Authorization: `Bearer ${testToken}` })
      );
      expect(res.status).toBe(404);
      expect(mockConnect).not.toHaveBeenCalled();
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("responde 404 sin tocar DB cuando DATABASE_CHECK_EXPIRES_AT no está en env", async () => {
      vi.stubEnv("DATABASE_CHECK_EXPIRES_AT", "");
      const res = await databaseCheckRoute(
        postCheck({ Authorization: `Bearer ${testToken}` })
      );
      expect(res.status).toBe(404);
      expect(mockConnect).not.toHaveBeenCalled();
    });

    it("responde 404 sin tocar DB cuando falta cabecera Authorization", async () => {
      const res = await databaseCheckRoute(postCheck());
      expect(res.status).toBe(404);
      expect(mockConnect).not.toHaveBeenCalled();
    });

    it("responde 404 sin tocar DB cuando Authorization no es Bearer", async () => {
      const res = await databaseCheckRoute(
        postCheck({ Authorization: `Basic ${testToken}` })
      );
      expect(res.status).toBe(404);
      expect(mockConnect).not.toHaveBeenCalled();
    });

    it("responde 404 sin tocar DB cuando el token es incorrecto", async () => {
      const res = await databaseCheckRoute(
        postCheck({ Authorization: "Bearer wrong-token-value" })
      );
      expect(res.status).toBe(404);
      expect(mockConnect).not.toHaveBeenCalled();
    });

    it("responde 404 sin tocar DB cuando el token expiró", async () => {
      vi.stubEnv("DATABASE_CHECK_EXPIRES_AT", String(Math.floor(Date.now() / 1000) - 10));
      const res = await databaseCheckRoute(
        postCheck({ Authorization: `Bearer ${testToken}` })
      );
      expect(res.status).toBe(404);
      expect(mockConnect).not.toHaveBeenCalled();
    });

    it("responde 404 sin tocar DB cuando expiración excede el límite de 30 minutos a futuro", async () => {
      vi.stubEnv(
        "DATABASE_CHECK_EXPIRES_AT",
        String(Math.floor(Date.now() / 1000) + 1805)
      );
      const res = await databaseCheckRoute(
        postCheck({ Authorization: `Bearer ${testToken}` })
      );
      expect(res.status).toBe(404);
      expect(mockConnect).not.toHaveBeenCalled();
    });

    it("responde 404 sin tocar DB cuando expiración es inválida no numérica", async () => {
      vi.stubEnv("DATABASE_CHECK_EXPIRES_AT", "no-es-un-timestamp");
      const res = await databaseCheckRoute(
        postCheck({ Authorization: `Bearer ${testToken}` })
      );
      expect(res.status).toBe(404);
      expect(mockConnect).not.toHaveBeenCalled();
    });

    it("responde 503 con configuración ausente cuando el token es válido pero falta DATABASE_URL", async () => {
      vi.stubEnv("DATABASE_URL", "");
      const res = await databaseCheckRoute(
        postCheck({ Authorization: `Bearer ${testToken}` })
      );
      expect(res.status).toBe(503);
      expect(mockConnect).not.toHaveBeenCalled();
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("SERVER_CONFIGURATION_ERROR");
    });
  });

  describe("4. Restricción de método HTTP y cabeceras", () => {
    it("responde 405 Method Not Allowed con Allow: POST y no-store al enviar GET", async () => {
      const req = new NextRequest(`${base}/api/internal/database-check`, {
        method: "GET",
        headers: { Authorization: `Bearer ${testToken}` },
      });
      const res = await handleDatabaseCheck(req);
      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("POST");
      expect(res.headers.get("cache-control")).toContain("no-store");
    });
  });

  describe("5. Consultas SQL fijas y compatibilidad con pooler en modo transacción", () => {
    it("utiliza únicamente consultas SQL fijas sin named/prepared statements", async () => {
      await checkDatabase();

      const queries = mockQuery.mock.calls.map((call) =>
        typeof call[0] === "string" ? call[0] : call[0].text
      );

      expect(queries).toEqual([
        "SELECT 1 AS probe",
        "BEGIN",
        "CREATE TEMP TABLE pg_temp.connection_probe (id int primary key, val text)",
        "INSERT INTO pg_temp.connection_probe (id, val) VALUES (1, 'probe')",
        "SELECT val FROM pg_temp.connection_probe WHERE id = 1",
        "ROLLBACK",
        "SELECT to_regclass('pg_temp.connection_probe') AS tbl",
      ]);

      // Verificar que ninguna consulta use named statements (propiedad 'name' prohibida en pooler)
      for (const call of mockQuery.mock.calls) {
        if (typeof call[0] === "object") {
          expect(call[0].name).toBeUndefined();
        }
      }
    });
  });

  describe("6. Comprobación exitosa (éxito)", () => {
    it("retorna 200 con solo booleans connected/read/write/rollback y sin exponer URIs ni hosts", async () => {
      const req = new NextRequest(`${base}/api/internal/database-check`, {
        method: "POST",
        headers: { Authorization: `Bearer ${testToken}` },
      });

      const res = await databaseCheckRoute(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toContain("no-store");

      const body = await res.json();
      expect(body).toEqual({
        success: true,
        data: {
          connected: true,
          read: true,
          write: true,
          rollback: true,
        },
      });

      const rawText = JSON.stringify(body);
      expect(rawText).not.toContain("supabase.co");
      expect(rawText).not.toContain("pooler.supabase.com");
      expect(rawText).not.toContain("postgres.fegczgleshuzgymtqrkv");
      expect(rawText).not.toContain("secretpassword");
      expect(rawText).not.toContain("6543");

      expect(mockEnd).toHaveBeenCalledTimes(1);
    });
  });

  describe("7. Fallo en rollback (rollbackfallo)", () => {
    it("retorna 503 limpio cuando la tabla temporal aún existe tras ROLLBACK", async () => {
      mockQuery.mockImplementation(async (sql: string | { text: string }) => {
        const q = typeof sql === "string" ? sql : sql.text;
        if (q === "SELECT 1 AS probe") return { rows: [{ probe: 1 }] };
        if (q === "BEGIN" || q === "ROLLBACK") return { rows: [] };
        if (q.startsWith("CREATE TEMP TABLE")) return { rows: [] };
        if (q.startsWith("INSERT INTO")) return { rows: [] };
        if (q === "SELECT val FROM pg_temp.connection_probe WHERE id = 1") {
          return { rows: [{ val: "probe" }] };
        }
        if (q === "SELECT to_regclass('pg_temp.connection_probe') AS tbl") {
          // Tabla aún presente: fallo en rollback
          return { rows: [{ tbl: "pg_temp.connection_probe" }] };
        }
        return { rows: [] };
      });

      const req = new NextRequest(`${base}/api/internal/database-check`, {
        method: "POST",
        headers: { Authorization: `Bearer ${testToken}` },
      });

      const res = await databaseCheckRoute(req);
      expect(res.status).toBe(503);
      expect(res.headers.get("cache-control")).toContain("no-store");

      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("DATABASE_CHECK_FAILED");
      expect(body.data.rollback).toBe(false);
      expect(body.data.connected).toBe(true);
      expect(body.data.read).toBe(true);
      expect(body.data.write).toBe(true);

      expect(mockEnd).toHaveBeenCalledTimes(1);
    });

    it("retorna 503 limpio cuando la instrucción ROLLBACK falla", async () => {
      mockQuery.mockImplementation(async (sql: string | { text: string }) => {
        const q = typeof sql === "string" ? sql : sql.text;
        if (q === "SELECT 1 AS probe") return { rows: [{ probe: 1 }] };
        if (q === "BEGIN") return { rows: [] };
        if (q.startsWith("CREATE TEMP TABLE")) return { rows: [] };
        if (q.startsWith("INSERT INTO")) return { rows: [] };
        if (q === "SELECT val FROM pg_temp.connection_probe WHERE id = 1") {
          return { rows: [{ val: "probe" }] };
        }
        if (q === "ROLLBACK") {
          throw new Error("Transacción fallida al revertir");
        }
        return { rows: [] };
      });

      const req = new NextRequest(`${base}/api/internal/database-check`, {
        method: "POST",
        headers: { Authorization: `Bearer ${testToken}` },
      });

      const res = await databaseCheckRoute(req);
      expect(res.status).toBe(503);
      expect(res.headers.get("cache-control")).toContain("no-store");

      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.data.rollback).toBe(false);

      expect(mockEnd).toHaveBeenCalledTimes(1);
    });
  });

  describe("8. Integración con Router del Worker", () => {
    it("sirve /api/internal/database-check directamente en Worker", async () => {
      const req = new Request(`${base}/api/internal/database-check`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${testToken}`,
          "content-type": "application/json",
        },
      });

      const env: RequestEnv = {
        DATABASE_URL: validPoolerUrl,
        DATABASE_CHECK_TOKEN: testToken,
        DATABASE_CHECK_EXPIRES_AT: getFutureExpiry(300),
      };

      const res = await worker.fetch(req, env, {});
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual({
        connected: true,
        read: true,
        write: true,
        rollback: true,
      });
      expect(res.headers.get("cache-control")).toContain("no-store");
    });

    it("retorna 405 con Allow: POST al enviar GET a /api/internal/database-check en el Worker", async () => {
      const req = new Request(`${base}/api/internal/database-check`, {
        method: "GET",
      });

      const res = await worker.fetch(req, {}, {});
      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("POST");
      expect(res.headers.get("cache-control")).toContain("no-store");
    });
  });
 it("Worker usa Hyperdrive sin requerir URI externa ni exponer binding",async()=>{
  const res=await worker.fetch(new Request(base+"/api/internal/database-check",{method:"POST",headers:{Authorization:`Bearer ${testToken}`}}),{HYPERDRIVE:{connectionString:"postgres://interno:solo-test@binding.local/postgres"},DATABASE_CHECK_TOKEN:testToken,DATABASE_CHECK_EXPIRES_AT:String(getFutureExpiry(600))},{});
  expect(res.status).toBe(200);expect(JSON.stringify(await res.json())).not.toContain("binding.local");expect(mockEnd).toHaveBeenCalledTimes(1);
 });
 it("binding mal configurado falla sin conectar y sin caer a URI global",()=>{
  expect(()=>createDatabaseClient({HYPERDRIVE:{connectionString:""}})).toThrow("Binding Hyperdrive inválido");expect(mockConnect).not.toHaveBeenCalled();
 });

});
