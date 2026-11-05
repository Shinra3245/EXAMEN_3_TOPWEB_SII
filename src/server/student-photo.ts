import "server-only";
import { Buffer } from "node:buffer";
import { requireSession } from "@/lib/session";
import { fetchSiiResource, SII_ENDPOINTS } from "@/lib/sii-client";
import { normalizeStudentProfile } from "@/lib/normalizers/student";
import {
  AuthenticationError,
  AppError,
  toSafeErrorResponse,
} from "@/lib/errors";
import { getSiiBaseUrl, getSiiTimeoutMs } from "@/config/env";
const MAX_BYTES = 2 * 1024 * 1024;
const MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function privateImage(bytes: Uint8Array, mime: string): Response {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
function decodeJpeg(value: string): Uint8Array | null {
  if (value.length > Math.ceil(MAX_BYTES / 3) * 4 + 8192)
    throw new AppError(404, "PHOTO_UNAVAILABLE", "Fotografía no disponible");
  const compact = value.replace(/[\t\n\r ]/g, "");
  if (!compact.startsWith("/9j/")) return null;
  if (compact.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact))
    throw new AppError(404, "PHOTO_UNAVAILABLE", "Fotografía no disponible");
  const bytes = Buffer.from(compact, "base64");
  if (
    !bytes.length ||
    bytes.length > MAX_BYTES ||
    bytes.toString("base64") !== compact ||
    bytes[0] !== 255 ||
    bytes[1] !== 216 ||
    bytes[2] !== 255
  )
    throw new AppError(404, "PHOTO_UNAVAILABLE", "Fotografía no disponible");
  return bytes;
}

export async function handleStudentPhoto(req: Request): Promise<Response> {
  try {
    const session = await requireSession(req);
    const profile = normalizeStudentProfile(
      await fetchSiiResource(SII_ENDPOINTS.STUDENT, session.token),
    );
    if (profile.numero_control !== session.numero_control)
      throw new AuthenticationError(
        "SESSION_IDENTITY_MISMATCH",
        "La identidad institucional no coincide con la sesión",
      );
    if (!profile.foto)
      throw new AppError(404, "PHOTO_UNAVAILABLE", "Fotografía no disponible");
    const jpeg = decodeJpeg(profile.foto);
    if (jpeg) return privateImage(jpeg, "image/jpeg");
    const base = getSiiBaseUrl();
    let url: URL;
    try {
      url = new URL(profile.foto, base);
    } catch {
      throw new AppError(404, "PHOTO_UNAVAILABLE", "Fotografía no disponible");
    }
    if (
      url.origin !== new URL(base).origin ||
      url.username ||
      url.password ||
      url.hash
    )
      throw new AppError(404, "PHOTO_UNAVAILABLE", "Fotografía no disponible");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), getSiiTimeoutMs());
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session.token}`,
          Accept: "image/jpeg,image/png,image/webp,image/gif",
        },
        signal: controller.signal,
        redirect: "manual",
        cache: "no-store",
      });
      if (
        !response.ok ||
        !MIME.has(
          (response.headers.get("content-type") ?? "")
            .split(";")[0]
            .trim()
            .toLowerCase(),
        )
      )
        throw new AppError(
          404,
          "PHOTO_UNAVAILABLE",
          "Fotografía no disponible",
        );
      if (
        Number(response.headers.get("content-length")) > MAX_BYTES ||
        !response.body
      )
        throw new AppError(
          404,
          "PHOTO_UNAVAILABLE",
          "Fotografía no disponible",
        );
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_BYTES)
            throw new AppError(
              404,
              "PHOTO_UNAVAILABLE",
              "Fotografía no disponible",
            );
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      if (!size)
        throw new AppError(
          404,
          "PHOTO_UNAVAILABLE",
          "Fotografía no disponible",
        );
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return new Response(bytes, {
        headers: {
          "Content-Type": response.headers.get("content-type")!,
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
        },
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(404, "PHOTO_UNAVAILABLE", "Fotografía no disponible");
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  } catch (error) {
    return toSafeErrorResponse(error, "Fotografía no disponible");
  }
}
