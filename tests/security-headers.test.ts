import { describe, it, expect, vi, afterEach } from "vitest";
import worker from "@/worker";
import openNextWorker from "../.open-next/worker.js";
import { withSecurityHeaders } from "@/lib/security-headers";

const secret = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const env = { SESSION_SECRET: secret };

afterEach(() => vi.restoreAllMocks());

describe("Cabeceras de seguridad", () => {
  it("se agregan a las páginas servidas por OpenNext", async () => {
    vi.spyOn(openNextWorker, "fetch").mockResolvedValueOnce(new Response("<html></html>"));
    const res = await worker.fetch(new Request("https://portal.example.invalid/login"), env, {});

    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("connect-src 'self'");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("permissions-policy")).toContain("camera=()");
    expect(res.headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(await res.text()).toBe("<html></html>");
  });

  it("también se agregan a las respuestas de la API, con una política que no carga nada", async () => {
    const res = await worker.fetch(new Request("https://portal.example.invalid/api/health"), env, {});

    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("también se agregan a los errores 404 y 405 de la API", async () => {
    const notFound = await worker.fetch(new Request("https://portal.example.invalid/api/nada"), env, {});
    const notAllowed = await worker.fetch(
      new Request("https://portal.example.invalid/api/auth/login", { method: "GET" }),
      env,
      {},
    );

    for (const res of [notFound, notAllowed]) {
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("x-frame-options")).toBe("DENY");
    }
  });

  it("agrega HSTS solo sobre HTTPS", () => {
    const https = withSecurityHeaders(new Response("ok"), "https://portal.example.invalid/");
    const http = withSecurityHeaders(new Response("ok"), "http://localhost:3000/");

    expect(https.headers.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains");
    expect(http.headers.get("strict-transport-security")).toBeNull();
  });

  it("no pisa las cabeceras que la ruta ya definió (p. ej. la CSP estricta de la foto)", () => {
    const original = new Response("img", {
      headers: { "Content-Security-Policy": "default-src 'none'; sandbox", "X-Frame-Options": "SAMEORIGIN" },
    });
    const res = withSecurityHeaders(original, "https://portal.example.invalid/api/student/photo");

    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });

  it("conserva estado, cuerpo y cookies de la respuesta original", async () => {
    const headers = new Headers({ "content-type": "application/json" });
    headers.append("Set-Cookie", "a=1; HttpOnly");
    const res = withSecurityHeaders(new Response('{"ok":true}', { status: 201, headers }), "https://x.invalid/api/x");

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("set-cookie")).toBe("a=1; HttpOnly");
  });
});
