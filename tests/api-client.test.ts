import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { apiRequest, advanceApiEpoch } from "@/lib/api-client";
const dispatchEvent = vi.fn();
beforeEach(() => {
  vi.stubGlobal("window", {
    location: { origin: "https://app.example" },
    dispatchEvent,
  });
  dispatchEvent.mockClear();
  advanceApiEpoch();
});
afterEach(() => vi.unstubAllGlobals());
describe("same-origin API client", () => {
  it.each([
    "https://sii.celaya.tecnm.mx/api/login",
    "//external.test/api/login",
    "/api/../../login",
    "/api/\\external.test",
    "/api/grades#fragment",
  ])("rejects non API paths: %s", async (path) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(apiRequest(path)).rejects.toMatchObject({
      code: "INVALID_API_PATH",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("forces private transport settings and unwraps success", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ success: true, data: { safe: true } }),
      );
    vi.stubGlobal("fetch", fetch);
    expect(
      await apiRequest("/api/grades", {
        cache: "force-cache",
        credentials: "omit",
        redirect: "follow",
      }),
    ).toEqual({ safe: true });
    expect(fetch.mock.calls[0][1]).toMatchObject({
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
    });
  });
  it("rejects malformed successful payload rather than trusting arbitrary JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ unexpected: [] })),
    );
    await expect(apiRequest("/api/grades")).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
  it("does not expose browser network exception details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("synthetic-private-detail")),
    );
    await expect(apiRequest("/api/grades")).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
    try {
      await apiRequest("/api/grades");
    } catch (error) {
      expect(String(error)).not.toContain("synthetic-private-detail");
    }
  });
  it("announces current unauthorized responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            success: false,
            error: { code: "EXPIRED", message: "Sesión expirada" },
          },
          { status: 401 },
        ),
      ),
    );
    await expect(apiRequest("/api/grades")).rejects.toMatchObject({
      status: 401,
    });
    expect(dispatchEvent).toHaveBeenCalledOnce();
  });
  it("does not let a stale 401 invalidate a newer session", async () => {
    let resolve!: (r: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise<Response>((r) => {
          resolve = r;
        }),
      ),
    );
    const pending = apiRequest("/api/grades");
    advanceApiEpoch();
    resolve(Response.json({ success: false }, { status: 401 }));
    await expect(pending).rejects.toMatchObject({ status: 401 });
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
  it("does not announce an aborted 401", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(Response.json({ success: false }, { status: 401 })),
    );
    controller.abort();
    await expect(
      apiRequest("/api/grades", { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});

it("rejects successful data that belongs to a previous session epoch", async () => {
  let resolve!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockReturnValue(
      new Promise<Response>((r) => {
        resolve = r;
      }),
    ),
  );
  const result = apiRequest("/api/student");
  advanceApiEpoch();
  resolve(Response.json({ success: true, data: { synthetic: "old-session" } }));
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
});
it("login rejection reports credentials without invalidating a session globally", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json(
          {
            success: false,
            error: {
              code: "INVALID_CREDENTIALS",
              message: "Credenciales inválidas",
            },
          },
          { status: 401 },
        ),
      ),
  );
  await expect(
    apiRequest("/api/auth/login", { method: "POST" }),
  ).rejects.toMatchObject({ status: 401, code: "INVALID_CREDENTIALS" });
  expect(dispatchEvent).not.toHaveBeenCalled();
});
