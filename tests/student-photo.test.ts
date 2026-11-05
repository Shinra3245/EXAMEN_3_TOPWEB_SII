import { beforeEach, describe, it, expect, vi } from "vitest";
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/sii-client", () => ({
  fetchSiiResource: vi.fn(),
  SII_ENDPOINTS: { STUDENT: "/api/movil/estudiante" },
}));
vi.mock("@/config/env", () => ({
  getSiiBaseUrl: () => "https://sii.celaya.tecnm.mx",
  getSiiTimeoutMs: () => 100,
}));
import { requireSession } from "@/lib/session";
import { fetchSiiResource } from "@/lib/sii-client";
import { AuthenticationError } from "@/lib/errors";
import { handleStudentPhoto } from "@/server/student-photo";
const request = () => new Request("https://example.test/api/student/photo");
beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(requireSession).mockResolvedValue({
    token: "synthetic",
    numero_control: "TEST",
    email: "synthetic@example.test",
    exp: 9999999999,
    createdAt: 1,
  });
  vi.mocked(fetchSiiResource).mockResolvedValue({
    numero_control: "TEST",
    foto: "/images/example.png",
  });
});
describe("private photo proxy", () => {
  it("rejects unauthenticated requests without network", async () => {
    vi.mocked(requireSession).mockRejectedValue(new AuthenticationError());
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect((await handleStudentPhoto(request())).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("never sends credentials to another origin", async () => {
    vi.mocked(fetchSiiResource).mockResolvedValue({
      numero_control: "TEST",
      foto: "https://elsewhere.test/image.png",
    });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect((await handleStudentPhoto(request())).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects a profile identity mismatch", async () => {
    vi.mocked(fetchSiiResource).mockResolvedValue({
      numero_control: "OTHER",
      foto: "/image.png",
    });
    expect((await handleStudentPhoto(request())).status).toBe(401);
  });
  it.each([
    new Response(null, {
      status: 302,
      headers: { Location: "https://elsewhere.test" },
    }),
    new Response("<svg/>", { headers: { "Content-Type": "image/svg+xml" } }),
    new Response("x", {
      headers: { "Content-Type": "image/png", "Content-Length": "3000000" },
    }),
  ])("rejects redirect, SVG and oversized photo", async (response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    expect((await handleStudentPhoto(request())).status).toBe(404);
  });
  it("does not fetch when no photo is provided", async () => {
    vi.mocked(fetchSiiResource).mockResolvedValue({
      numero_control: "TEST",
      foto: "",
    });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect((await handleStudentPhoto(request())).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("bounds streamed bytes even without content-length", async () => {
    const cancel = vi.fn();
    let sent = false;
    const body = new ReadableStream({
      pull(controller) {
        if (!sent) {
          sent = true;
          controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
        }
      },
      cancel,
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(body, { headers: { "Content-Type": "image/png" } }),
        ),
    );
    expect((await handleStudentPhoto(request())).status).toBe(404);
    expect(cancel).toHaveBeenCalled();
  });
  it("does not expose arbitrary network errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("synthetic-private-upstream-detail")),
    );
    const response = await handleStudentPhoto(request());
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain(
      "synthetic-private-upstream-detail",
    );
  });
  it("serves only allowed bytes privately without upstream headers", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: {
          "Content-Type": "image/png",
          "Set-Cookie": "upstream-private",
        },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const result = await handleStudentPhoto(request());
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toContain("no-store");
    expect(result.headers.get("set-cookie")).toBeNull();
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(fetch.mock.calls[0][1].redirect).toBe("manual");
  });
});

it("decodes observed line-wrapped JPEG base64 without treating it as a URL", async () => {
  const bytes = Buffer.from([255, 216, 255, 224, 0, 16]);
  const encoded = bytes.toString("base64");
  vi.mocked(fetchSiiResource).mockResolvedValue({
    numero_control: "TEST",
    foto: encoded.slice(0, 4) + "\r\n " + encoded.slice(4),
  });
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const response = await handleStudentPhoto(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/jpeg");
  expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  expect(fetch).not.toHaveBeenCalled();
});
it("rejects malformed raw JPEG base64 without fetching it as a URL", async () => {
  vi.mocked(fetchSiiResource).mockResolvedValue({
    numero_control: "TEST",
    foto: "/9j/INVALID$",
  });
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect((await handleStudentPhoto(request())).status).toBe(404);
  expect(fetch).not.toHaveBeenCalled();
});
