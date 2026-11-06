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
