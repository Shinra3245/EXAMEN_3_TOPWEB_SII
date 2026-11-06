import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const query = vi.fn();
let dbAvailable = true;

vi.mock("@/lib/db", () => ({
  withDatabase: vi.fn(async (callback: (client: unknown) => unknown) => {
    if (!dbAvailable) throw new Error("base no disponible");
    return callback({ query });
  }),
}));

import { POST as login } from "@/app/api/auth/login/route";
import { resetRateLimitsForTests } from "@/lib/rate-limit";

const base = "https://portal.example.invalid";
const attempt = (email = "alumno@example.invalid", ip = "203.0.113.5") =>
  new NextRequest(base + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: base, "cf-connecting-ip": ip },
    body: JSON.stringify({ email, password: "clave-ficticia" }),
  });

function stubSiiRejecting() {
  const fetchMock = vi.fn().mockImplementation(
    async () => new Response('{"message":"no"}', { status: 401, headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "ab".repeat(32));
  resetRateLimitsForTests();
  query.mockReset();
  dbAvailable = true;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Contador compartido de intentos en base de datos", () => {
  it("bloquea con 429 cuando la base indica que se agotó el cupo, sin llegar al SII", async () => {
    const fetchMock = stubSiiRejecting();
    query.mockResolvedValue({ rows: [{ ip_ok: true, account_ok: false }] });

    const res = await login(attempt());

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("permite el intento cuando la base lo permite y manda cubetas, límites y ventana correctos", async () => {
    stubSiiRejecting();
    query.mockResolvedValue({ rows: [{ ip_ok: true, account_ok: true }] });

    const res = await login(attempt("Alumno@Example.invalid", "198.51.100.7"));

    expect(res.status).toBe(401);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("app.register_login_attempt");
    expect(params[0]).toBe("ip:198.51.100.7");
    expect(params.slice(1, 3)).toEqual([10, 60]);
    // La cuenta viaja como huella SHA-256, nunca el correo.
    expect(params[3]).toMatch(/^acct:[0-9a-f]{64}$/);
    expect(params[3]).not.toContain("alumno");
    expect(params.slice(4, 6)).toEqual([5, 60]);
  });

  it("si la base falla, no bloquea el inicio de sesión (falla abierto)", async () => {
    stubSiiRejecting();
    dbAvailable = false;

    expect((await login(attempt())).status).toBe(401);
  });

  it("si la función aún no existe (migración sin aplicar), no bloquea", async () => {
    stubSiiRejecting();
    query.mockRejectedValue(new Error('function app.register_login_attempt does not exist'));

    expect((await login(attempt())).status).toBe(401);
  });

  it("no consulta la base si otro contador ya bloqueó el intento", async () => {
    stubSiiRejecting();
    query.mockResolvedValue({ rows: [{ ip_ok: true, account_ok: true }] });
    for (let i = 0; i < 5; i++) await login(attempt("victima@example.invalid", `203.0.113.${i}`));
    query.mockClear();

    const res = await login(attempt("victima@example.invalid", "203.0.113.99"));

    expect(res.status).toBe(429);
    expect(query).not.toHaveBeenCalled();
  });
});
