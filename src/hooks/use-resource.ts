"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest, ApiClientError } from "@/lib/api-client";

export function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    try {
      const result = await apiRequest<T>(path, { signal: request.signal });
      if (!request.signal.aborted) setData(result);
    } catch (e) {
      if (!request.signal.aborted)
        setError(
          e instanceof ApiClientError
            ? e.message
            : "No fue posible consultar los datos. Intenta de nuevo.",
        );
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }, [path]);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setData(null);
    await load();
  }, [load]);
  // The effect synchronizes with an external API; state updates occur after its awaited response.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    void load();
    return () => controller.current?.abort();
  }, [load]);
  return { data, loading, error, refresh };
}
