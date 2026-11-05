const openNextWorker = {
  async fetch(_request: Request, _env: unknown, _ctx: unknown): Promise<Response> {
    throw new Error("Fallback OpenNext no simulado explícitamente en esta prueba");
  },
};
export default openNextWorker;
