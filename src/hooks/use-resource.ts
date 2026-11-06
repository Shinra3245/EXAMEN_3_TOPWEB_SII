"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest, ApiClientError } from "@/lib/api-client";
import {
  getVisibleResourceState,
  isAbortError,
  type ResourceSnapshot,
} from "./resource-snapshot";

export function useResource<T>(path: string) {
  // La identidad cambia con la ruta para separar estados de recursos distintos.
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
    // Solo se conserva activa la petición más reciente de este hook.
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
      if (request.signal.aborted || isAbortError(cause)) return;

      const error =
        cause instanceof ApiClientError
          ? cause.message
          : "No fue posible consultar los datos. Intenta de nuevo.";

      setSnapshot((current) => ({
        key: resourceKey,
        path,
        // No mostrar datos de una ruta anterior si esta petición falla.
        data: current.key === resourceKey ? current.data : null,
        loading: false,
        error,
      }));
    }
  }, [path, resourceKey]);

  const initialLoadRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    // Si se solicita recarga inmediata, cancela la carga diferida inicial para
    // evitar ciclos de doble petición HTTP y abortos redundantes.
    if (initialLoadRef.current) {
      clearTimeout(initialLoadRef.current);
      initialLoadRef.current = null;
    }

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
    // Permite cancelar la carga inicial si el efecto se limpia de inmediato.
    initialLoadRef.current = setTimeout(() => {
      initialLoadRef.current = null;
      void load();
    }, 0);

    return () => {
      if (initialLoadRef.current) {
        clearTimeout(initialLoadRef.current);
        initialLoadRef.current = null;
      }
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
