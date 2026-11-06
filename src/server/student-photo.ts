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
// Límite duro de la foto (2 MB) para acotar memoria y ancho de banda del Worker.
const MAX_BYTES = 2 * 1024 * 1024;
// Tipos MIME permitidos: cualquier otro se trata como "no disponible".
const MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function privateImage(bytes: Uint8Array, mime: string): Response {
  // Respuesta de imagen servida desde datos del SII: no se cachea, se prohíbe
  // el sniffing de tipo y se aplica CSP sandbox por si el contenido fuese activo.
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
  // Cota de longitud del string base64 coherente con MAX_BYTES.
  if (value.length > Math.ceil(MAX_BYTES / 3) * 4 + 8192)
    throw new AppError(404, "PHOTO_UNAVAILABLE", "Fotografía no disponible");
  const compact = value.replace(/[\t\n\r ]/g, "");
  // Solo se decodifica inline si el base64 empieza con el prefijo JPEG (0xFF 0xD8 0xFF => /9j/).
  if (!compact.startsWith("/9j/")) return null;
  // Base64 bien formado: longitud múltiplo de 4 y alfabeto estándar con padding.
  if (compact.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact))
    throw new AppError(404, "PHOTO_UNAVAILABLE", "Fotografía no disponible");
  const bytes = Buffer.from(compact, "base64");
  // Re-codificar y comparar detecta base64 canónico (evita variantes no estándar);
  // los primeros bytes 0xFF 0xD8 0xFF confirman la cabecera SOI+APP de JPEG.
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
    // Caso 1: el SII devuelve la foto inline como una cadena base64 JPEG.
    const jpeg = decodeJpeg(profile.foto);
    if (jpeg) return privateImage(jpeg, "image/jpeg");
    // Caso 2: la foto es una URL que debe descargarse del SII.
    const base = getSiiBaseUrl();
    let url: URL;
    try {
      url = new URL(profile.foto, base);
    } catch {
      throw new AppError(404, "PHOTO_UNAVAILABLE", "Fotografía no disponible");
    }
    // Solo se permite el mismo origen del SII, sin credenciales ni fragmento.
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
        // Sin seguir redirecciones: podrían desviar hacia otro origen.
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
      // Rechazo temprano por Content-Length declarado o si el cuerpo es nulo.
      if (
        Number(response.headers.get("content-length")) > MAX_BYTES ||
        !response.body
      )
        throw new AppError(
          404,
          "PHOTO_UNAVAILABLE",
          "Fotografía no disponible",
        );
      // Lectura por streaming con corte al superar MAX_BYTES, sin confiar en Content-Length.
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
      // Reutiliza el Content-Type ya validado frente a MIME.
      return new Response(bytes, {
        headers: {
          "Content-Type": response.headers.get("content-type")!,
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
        },
      });
    } catch (error) {
      // Cualquier fallo de red/parseo se normaliza como 404 (no se filtra detalle).
      if (error instanceof AppError) throw error;
      throw new AppError(404, "PHOTO_UNAVAILABLE", "Fotografía no disponible");
    } finally {
      clearTimeout(timer);
      // Aborta explícitamente por si el fetch terminó por otras razones.
      controller.abort();
    }
  } catch (error) {
    return toSafeErrorResponse(error, "Fotografía no disponible");
  }
}
