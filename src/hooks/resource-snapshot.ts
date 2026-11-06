// La clave distingue estados de recursos aunque las rutas anteriores sigan en memoria.
export interface ResourceSnapshot<T> {
  key: symbol;
  path: string;
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function getVisibleResourceState<T>(
  snapshot: ResourceSnapshot<T>,
  key: symbol,
  path: string,
): ResourceSnapshot<T> {
  if (snapshot.key === key) return snapshot;

  // Al cambiar el recurso, oculta datos y errores de la consulta anterior.
  return {
    key,
    path,
    data: null,
    loading: true,
    error: null,
  };
}

/**
 * Determina si una causa de error corresponde a una solicitud abortada
 * (por timeout, desmontaje o cambio de época de sesión en el cliente API).
 */
export function isAbortError(cause: unknown): boolean {
  if (!cause) return false;
  if (cause instanceof Error && cause.name === "AbortError") return true;
  if (
    typeof DOMException !== "undefined" &&
    cause instanceof DOMException &&
    cause.name === "AbortError"
  ) {
    return true;
  }
  if (
    typeof cause === "object" &&
    (cause as { name?: string }).name === "AbortError"
  ) {
    return true;
  }
  return false;
}

