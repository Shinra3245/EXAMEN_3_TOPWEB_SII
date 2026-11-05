import "server-only";
import { UpstreamError } from "./errors";

export async function readBoundedText(response: Response | Request, maxBytes: number): Promise<string> {
  const length = response.headers.get("content-length");
  if (length && Number(length) > maxBytes) {
    throw new UpstreamError(502, "BODY_TOO_LARGE", "La respuesta excede el tamaño máximo permitido");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let count = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      count += value.byteLength;
      if (count > maxBytes) {
        await reader.cancel();
        throw new UpstreamError(502, "BODY_TOO_LARGE", "La respuesta excede el tamaño máximo permitido");
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(count);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return new TextDecoder().decode(bytes);
}
