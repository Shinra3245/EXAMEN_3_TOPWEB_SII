/**
 * Cabeceras de seguridad que el Worker agrega a TODA respuesta (páginas, API y
 * archivos estáticos), para que ninguna ruta dependa de acordarse de ponerlas.
 */

/**
 * Política de contenido para las páginas. Next.js inserta scripts y estilos en
 * línea para la hidratación, por eso se permite 'unsafe-inline'; el resto se
 * limita al propio origen.
 */
const PAGE_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Impide que otro sitio incruste el portal en un iframe (clickjacking).
  "frame-ancestors 'none'",
].join("; ");

/** Las respuestas de la API son JSON: no necesitan cargar ningún recurso. */
const API_CSP = "default-src 'none'; frame-ancestors 'none'";

const PERMISSIONS_POLICY = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
  "payment=()",
  "usb=()",
].join(", ");

/**
 * Devuelve una copia de la respuesta con las cabeceras de seguridad. No pisa
 * las que la ruta ya definió (p. ej. la CSP más estricta de la foto).
 */
export function withSecurityHeaders(response: Response, requestUrl: string): Response {
  const url = new URL(requestUrl);
  const headers = new Headers(response.headers);
  const isApi = url.pathname === "/api" || url.pathname.startsWith("/api/");

  const defaults: Record<string, string> = {
    "Content-Security-Policy": isApi ? API_CSP : PAGE_CSP,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": PERMISSIONS_POLICY,
    "Cross-Origin-Opener-Policy": "same-origin",
  };

  // HSTS solo tiene sentido (y solo se acepta) sobre HTTPS.
  if (url.protocol === "https:") {
    defaults["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  }

  for (const [name, value] of Object.entries(defaults)) {
    if (!headers.has(name)) headers.set(name, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
