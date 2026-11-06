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

  return {
    key,
    path,
    data: null,
    loading: true,
    error: null,
  };
}
