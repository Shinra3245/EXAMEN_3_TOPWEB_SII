import "server-only";
import { UpstreamError } from "./errors";

export async function readBoundedText(
  response: Response | Request,
  maxBytes: number,
): Promise<string> {
  const contentLength = response.headers.get("content-length");
  // Rechazo temprano cuando el tamaño declarado ya supera el límite.
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new UpstreamError(
      502,
      "BODY_TOO_LARGE",
      "La respuesta excede el tamaño máximo permitido",
    );
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteCount = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      byteCount += value.byteLength;
      if (byteCount > maxBytes) {
        // También se limita el stream cuando Content-Length falta o no es fiable.
        await reader.cancel();
        throw new UpstreamError(
          502,
          "BODY_TOO_LARGE",
          "La respuesta excede el tamaño máximo permitido",
        );
      }

      chunks.push(value);
    }
  } finally {
    // Libera el reader tanto al terminar como si la lectura falla.
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteCount);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(bytes);
}
