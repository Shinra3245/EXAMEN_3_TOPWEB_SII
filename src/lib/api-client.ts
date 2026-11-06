export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  error?: {
    message?: string;
    code?: string;
  };
}

// Generación de sesión para descartar respuestas de sesiones anteriores.
let epoch = 0;

export function advanceApiEpoch(): number {
  return ++epoch;
}

export async function apiRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  // En SSR se usa un origen ficticio solo para validar la ruta relativa.
  const base =
    typeof window === "undefined"
      ? "https://same-origin.invalid"
      : window.location.origin;

  let url: URL;
  try {
    url = new URL(path, base);
  } catch {
    throw new ApiClientError(
      "Ruta de consulta no válida",
      400,
      "INVALID_API_PATH",
    );
  }

  // Acepta únicamente rutas API del mismo origen, sin fragmentos ni backslashes.
  if (
    !path.startsWith("/api/") ||
    path.includes("\\") ||
    url.origin !== base ||
    !url.pathname.startsWith("/api/") ||
    url.hash
  ) {
    throw new ApiClientError(
      "Ruta de consulta no válida",
      400,
      "INVALID_API_PATH",
    );
  }

  const requestEpoch = epoch;
  const headers = new Headers(options?.headers);
  headers.set("Accept", "application/json");

  if (typeof options?.body === "string") {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      headers,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    });
  } catch (error) {
    // Los abortos se propagan para que el consumidor no los trate como fallos de red.
    if (
      options?.signal?.aborted ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      throw error;
    }

    throw new ApiClientError(
      "No fue posible conectar con el servicio. Verifica tu conexión e intenta de nuevo.",
      0,
      "NETWORK_ERROR",
    );
  }

  let body: ApiResponse<T> | null = null;
  try {
    body = await response.json();
  } catch {
    // La validación del sobre más abajo rechaza las respuestas mal formadas.
  }

  if (options?.signal?.aborted) {
    throw new DOMException("Request aborted", "AbortError");
  }

  // Un 401 protegido avisa al proveedor de sesión, salvo si ya cambió la generación.
  if (
    response.status === 401 &&
    url.pathname !== "/api/auth/login" &&
    requestEpoch === epoch &&
    typeof window !== "undefined"
  ) {
    window.dispatchEvent(new CustomEvent("sii:unauthorized"));
  }

  if (!response.ok) {
    throw new ApiClientError(
      typeof body?.error?.message === "string"
        ? body.error.message
        : "La consulta no pudo completarse. Intenta de nuevo.",
      response.status,
      typeof body?.error?.code === "string" ? body.error.code : undefined,
    );
  }

  // Descarta la respuesta si login o logout ocurrió mientras esperaba el servidor.
  if (requestEpoch !== epoch) {
    throw new DOMException("Session changed", "AbortError");
  }

  // El cliente solo acepta el sobre de éxito definido por la API.
  if (body?.success !== true || !Object.hasOwn(body, "data")) {
    throw new ApiClientError(
      "La respuesta del servicio no es válida. Intenta de nuevo.",
      502,
      "INVALID_RESPONSE",
    );
  }

  return body.data as T;
}
