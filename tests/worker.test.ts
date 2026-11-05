import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "@/worker";
import openNextWorker from "../.open-next/worker.js";
import { runWithEnv, getEnvVar, RequestEnv } from "@/config/env";
import { encryptSession } from "@/lib/crypto";

describe("Worker Entrypoint & API Router", () => {
  const secretA = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const secretB = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
  const base = "http://localhost:3000";

  beforeEach(() => {
    vi.stubEnv("SESSION_SECRET", secretA);
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("Enrutamiento directo y evitación de fallback OpenNext para /api/*", () => {
    it("sirve /api/health directamente en el Worker sin llamar al fallback de OpenNext", async () => {
      const openNextSpy = vi.spyOn(openNextWorker, "fetch");

      const req = new Request(`${base}/api/health`, { method: "GET" });
      const env: RequestEnv = { SESSION_SECRET: secretA };
      const res = await worker.fetch(req, env, {});

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("ok");
      expect(data.service).toBe("sii-cloudflare-backend");
      expect(res.headers.get("cache-control")).toContain("no-store");

      // No debe llamar al worker de OpenNext
      expect(openNextSpy).not.toHaveBeenCalled();
    });

    it("retorna 404 NOT_FOUND directamente para rutas /api/* desconocidas sin fallback a OpenNext", async () => {
      const openNextSpy = vi.spyOn(openNextWorker, "fetch");

      const req = new Request(`${base}/api/ruta-inexistente`, { method: "GET" });
      const env: RequestEnv = { SESSION_SECRET: secretA };
      const res = await worker.fetch(req, env, {});

      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toContain("no-store");

      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe("NOT_FOUND");

      // Crítico: No debe delegar al fallback de Next/OpenNext
      expect(openNextSpy).not.toHaveBeenCalled();
    });

    it("delega rutas no-API (como / o assets) al fallback del Worker OpenNext", async () => {
      const openNextSpy = vi
        .spyOn(openNextWorker, "fetch")
        .mockResolvedValueOnce(new Response("Página Next.js", { status: 200 }));

      const req = new Request(`${base}/`, { method: "GET" });
      const env: RequestEnv = { SESSION_SECRET: secretA };
      const res = await worker.fetch(req, env, {});

      expect(res.status).toBe(200);
      expect(await res.text()).toBe("Página Next.js");
      expect(openNextSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("Control de métodos HTTP no permitidos (405 Method Not Allowed)", () => {
    it("retorna 405 con Allow: POST y no-store al enviar GET a /api/auth/login", async () => {
      const req = new Request(`${base}/api/auth/login`, { method: "GET" });
      const res = await worker.fetch(req, { SESSION_SECRET: secretA }, {});

      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("POST");
      expect(res.headers.get("cache-control")).toContain("no-store");

      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe("METHOD_NOT_ALLOWED");
    });

    it("retorna 405 con Allow: GET y no-store al enviar POST a /api/health", async () => {
      const req = new Request(`${base}/api/health`, { method: "POST" });
      const res = await worker.fetch(req, { SESSION_SECRET: secretA }, {});

      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("GET");
      expect(res.headers.get("cache-control")).toContain("no-store");
    });

    it("retorna 405 con Allow: GET al enviar POST a rutas académicas", async () => {
      for (const endpoint of ["/api/student", "/api/grades", "/api/kardex", "/api/schedule", "/api/auth/session"]) {
        const req = new Request(`${base}${endpoint}`, { method: "POST" });
        const res = await worker.fetch(req, { SESSION_SECRET: secretA }, {});

        expect(res.status).toBe(405);
        expect(res.headers.get("allow")).toBe("GET");
        expect(res.headers.get("cache-control")).toContain("no-store");
      }
    });

    it("retorna 405 con Allow: POST al enviar GET a /api/auth/logout", async () => {
      const req = new Request(`${base}/api/auth/logout`, { method: "GET" });
      const res = await worker.fetch(req, { SESSION_SECRET: secretA }, {});

      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("POST");
      expect(res.headers.get("cache-control")).toContain("no-store");
    });
  });

  describe("Aislamiento de contexto env concurrente con AsyncLocalStorage", () => {
    it("mantiene el contexto de variables de entorno aislado en peticiones concurrentes", async () => {
      const env1: RequestEnv = { SESSION_SECRET: secretA, APP_ORIGIN: "https://worker-1.workers.dev" };
      const env2: RequestEnv = { SESSION_SECRET: secretB, APP_ORIGIN: "https://worker-2.workers.dev" };

      // Ejecutar dos operaciones concurrentes que lean sus respectivos contextos
      const task1 = runWithEnv(env1, async () => {
        // Simular retardo asíncrono
        await new Promise((r) => setTimeout(r, 10));
        return {
          secret: getEnvVar("SESSION_SECRET"),
          origin: getEnvVar("APP_ORIGIN"),
        };
      });

      const task2 = runWithEnv(env2, async () => {
        await new Promise((r) => setTimeout(r, 5));
        return {
          secret: getEnvVar("SESSION_SECRET"),
          origin: getEnvVar("APP_ORIGIN"),
        };
      });

      const [res1, res2] = await Promise.all([task1, task2]);

      expect(res1.secret).toBe(secretA);
      expect(res1.origin).toBe("https://worker-1.workers.dev");

      expect(res2.secret).toBe(secretB);
      expect(res2.origin).toBe("https://worker-2.workers.dev");
    });

    it("valida Origin contra APP_ORIGIN provisto en el env por petición", async () => {
      const env: RequestEnv = {
        SESSION_SECRET: secretA,
        APP_ORIGIN: "https://examen3-sii.shinra3245.workers.dev",
      };

      // Petición con Origin coincidente con env.APP_ORIGIN
      const reqOk = new Request(`${base}/api/auth/logout`, {
        method: "POST",
        headers: {
          origin: "https://examen3-sii.shinra3245.workers.dev",
        },
      });
      const resOk = await worker.fetch(reqOk, env, {});
      expect(resOk.status).toBe(200);

      // Petición con Origin forjado/cruzado
      const reqFail = new Request(`${base}/api/auth/logout`, {
        method: "POST",
        headers: {
          origin: "https://ataque.invalid",
        },
      });
      const resFail = await worker.fetch(reqFail, env, {});
      expect(resFail.status).toBe(403);
    });
  });

  describe("Seguridad e invariantes de autenticación y configuración", () => {
    it("responde 503 si SESSION_SECRET está ausente en env y process.env", async () => {
      vi.stubEnv("SESSION_SECRET", "");
      const req = new Request(`${base}/api/auth/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: base,
        },
        body: JSON.stringify({ email: "user@example.invalid", password: "pwd" }),
      });

      const res = await worker.fetch(req, { SESSION_SECRET: "" }, {});
      expect(res.status).toBe(503);

      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe("SERVER_CONFIGURATION_ERROR");
    });

    it("responde 401 en /api/student si no hay cookie de sesión activa", async () => {
      const req = new Request(`${base}/api/student`, { method: "GET" });
      const res = await worker.fetch(req, { SESSION_SECRET: secretA }, {});

      expect(res.status).toBe(401);
      expect(res.headers.get("cache-control")).toContain("no-store");
    });

    it("responde 401 si la cookie de sesión fue cifrada con otra clave o está alterada", async () => {
      // Cifrar con secretB
      vi.stubEnv("SESSION_SECRET", secretB);
      const foreignCookie = await encryptSession({
        token: "fake-jwt",
        numero_control: "20120001",
        exp: Math.floor(Date.now() / 1000) + 1800,
        createdAt: Math.floor(Date.now() / 1000),
      });

      // El Worker recibe secretA en env
      const req = new Request(`${base}/api/student`, {
        method: "GET",
        headers: {
          cookie: `sii_session=${foreignCookie}`,
        },
      });

      const res = await worker.fetch(req, { SESSION_SECRET: secretA }, {});
      expect(res.status).toBe(401);
    });
  });
  it("un env Worker sin clave no hereda una clave global de Node", async () => {
    const fetchSpy=vi.fn();vi.stubGlobal("fetch",fetchSpy);
    const req=new Request(base+"/api/auth/login",{method:"POST",headers:{Origin:base},body:"{}"});
    const response=await worker.fetch(req,{},{});
    expect(response.status).toBe(503);expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("APP_ORIGIN tiene prioridad incluso cuando req.url es localhost",async()=>{
    const req=new Request(base+"/api/auth/logout",{method:"POST",headers:{Origin:base}});
    const response=await worker.fetch(req,{APP_ORIGIN:"https://canonical.example.invalid"},{});
    expect(response.status).toBe(403);
  });
  it("no hereda APP_ORIGIN global cuando existe contexto Worker sin esa variable",async()=>{
    vi.stubEnv("APP_ORIGIN","https://otro.example.invalid");
    const req=new Request(base+"/api/auth/logout",{method:"POST",headers:{Origin:base}});
    expect((await worker.fetch(req,{},{})).status).toBe(200);
  });
  it("/api sin barra también queda excluida del fallback",async()=>{
    const spy=vi.spyOn(openNextWorker,"fetch");
    expect((await worker.fetch(new Request(base+"/api"),{},{})).status).toBe(404);
    expect(spy).not.toHaveBeenCalled();
  });

});
