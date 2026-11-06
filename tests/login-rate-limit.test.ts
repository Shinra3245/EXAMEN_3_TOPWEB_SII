import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as login } from "@/app/api/auth/login/route";
import { runWithEnv } from "@/config/env";
import { resetRateLimitsForTests } from "@/lib/rate-limit";

const base = "https://portal.example.invalid";
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

const attempt = (email: string, ip = "203.0.113.5") =>
  new NextRequest(base + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: base, "cf-connecting-ip": ip },
    body: JSON.stringify({ email, password: "clave-ficticia" }),
  });

/** El SII rechaza siempre: lo que se mide es cuántas llamadas llegan a él. */
function stubSiiRejecting() {
  const fetchMock = vi.fn().mockImplementation(async () => json({ message: "no" }, 401));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "ab".repeat(32));
  resetRateLimitsForTests();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Límite de intentos de inicio de sesión", () => {
  it("bloquea el 6.º intento contra la misma cuenta y no llega al SII", async () => {
    const fetchMock = stubSiiRejecting();

    for (let i = 0; i < 5; i++) {
      expect((await login(attempt("victima@example.invalid", `203.0.113.${i}`))).status).toBe(401);
    }
    const blocked = await login(attempt("victima@example.invalid", "203.0.113.99"));

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("60");
    expect(blocked.headers.get("cache-control")).toContain("no-store");
    expect((await blocked.json()).error.code).toBe("TOO_MANY_LOGIN_ATTEMPTS");
    // 5 intentos llegaron al SII; el bloqueado no.
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("bloquea a una misma IP que prueba muchas cuentas distintas", async () => {
    const fetchMock = stubSiiRejecting();

    for (let i = 0; i < 10; i++) {
      expect((await login(attempt(`persona${i}@example.invalid`))).status).toBe(401);
    }
    const blocked = await login(attempt("otra@example.invalid"));

    expect(blocked.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it("no afecta a otra cuenta ni a otra IP", async () => {
    stubSiiRejecting();
    for (let i = 0; i < 5; i++) await login(attempt("victima@example.invalid", `198.51.100.${i}`));

    expect((await login(attempt("victima@example.invalid", "198.51.100.77"))).status).toBe(429);
    expect((await login(attempt("otra-cuenta@example.invalid", "192.0.2.10"))).status).toBe(401);
  });

  it("trata igual el correo con mayúsculas o espacios", async () => {
    stubSiiRejecting();
    for (let i = 0; i < 5; i++) await login(attempt("Victima@Example.invalid", `203.0.113.${i}`));

    expect((await login(attempt("  victima@example.invalid ", "203.0.113.50"))).status).toBe(429);
  });

  it("usa el binding de Cloudflare cuando existe y respeta su veredicto", async () => {
    const fetchMock = stubSiiRejecting();
    const ipLimiter = { limit: vi.fn().mockResolvedValue({ success: true }) };
    const accountLimiter = { limit: vi.fn().mockResolvedValue({ success: false }) };

    const res = await runWithEnv(
      { SESSION_SECRET: "ab".repeat(32), LOGIN_IP_LIMITER: ipLimiter, LOGIN_ACCOUNT_LIMITER: accountLimiter },
      () => login(attempt("victima@example.invalid")),
    );

    expect(res.status).toBe(429);
    expect(ipLimiter.limit).toHaveBeenCalledWith({ key: "203.0.113.5" });
    // La cuenta se envía como huella SHA-256, nunca el correo en claro.
    const accountKey = accountLimiter.limit.mock.calls[0][0].key as string;
    expect(accountKey).toMatch(/^[0-9a-f]{64}$/);
    expect(accountKey).not.toContain("victima");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("el contador en memoria bloquea aunque el binding de Cloudflare deje pasar (es aproximado)", async () => {
    const fetchMock = stubSiiRejecting();
    const permissive = { limit: vi.fn().mockResolvedValue({ success: true }) };
    const env = { SESSION_SECRET: "ab".repeat(32), LOGIN_IP_LIMITER: permissive, LOGIN_ACCOUNT_LIMITER: permissive };

    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await runWithEnv(env, () => login(attempt("victima@example.invalid", `203.0.113.${i}`)));
      statuses.push(res.status);
    }

    expect(statuses).toEqual([401, 401, 401, 401, 401, 429, 429]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("no cuenta intentos con el cuerpo inválido (se rechazan antes)", async () => {
    stubSiiRejecting();
    const bad = new NextRequest(base + "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: base },
      body: JSON.stringify({ email: "", password: "" }),
    });

    expect((await login(bad)).status).toBe(400);
  });
});
