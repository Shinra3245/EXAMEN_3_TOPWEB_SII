import openNextWorker from "../.open-next/worker.js";
import { handleWorkerApi } from "./server/router";
import type { RequestEnv } from "./config/env";

const worker = {
  async fetch(
    request: Request,
    env: RequestEnv,
    ctx: unknown
  ): Promise<Response> {
    const url = new URL(request.url);

    // Servir directamente las rutas de API con Web Request/Response en Worker puro
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return handleWorkerApi(request, env);
    }

    // Fallback a OpenNext para páginas Next.js, assets y rutas no-API
    return openNextWorker.fetch(request, env, ctx);
  },
};

export default worker;
