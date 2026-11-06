"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest, ApiClientError } from "@/lib/api-client";
import {
  getVisibleResourceState,
  type ResourceSnapshot,
} from "./resource-snapshot";

export function useResource<T>(path: string) {
  const resourceKey = useMemo(() => Symbol(path), [path]);
  const [snapshot, setSnapshot] = useState<ResourceSnapshot<T>>(() => ({
    key: resourceKey,
    path,
    data: null,
    loading: true,
    error: null,
  }));
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;

    try {
      const data = await apiRequest<T>(path, { signal: request.signal });
      if (!request.signal.aborted) {
        setSnapshot({
          key: resourceKey,
          path,
          data,
          loading: false,
          error: null,
        });
      }
    } catch (cause) {
      if (request.signal.aborted) return;

      const error =
        cause instanceof ApiClientError
          ? cause.message
          : "No fue posible consultar los datos. Intenta de nuevo.";

      setSnapshot((current) => ({
        key: resourceKey,
        path,
        data: current.key === resourceKey ? current.data : null,
        loading: false,
        error,
      }));
    }
  }, [path, resourceKey]);

  const refresh = useCallback(async () => {
    setSnapshot({
      key: resourceKey,
      path,
      data: null,
      loading: true,
      error: null,
    });
    await load();
  }, [load, path, resourceKey]);

  useEffect(() => {
    const initialLoad = setTimeout(() => {
      void load();
    }, 0);

    return () => {
      clearTimeout(initialLoad);
      controller.current?.abort();
    };
  }, [load]);

  const visibleSnapshot = getVisibleResourceState(snapshot, resourceKey, path);

  return {
    data: visibleSnapshot.data,
    loading: visibleSnapshot.loading,
    error: visibleSnapshot.error,
    refresh,
  };
}
