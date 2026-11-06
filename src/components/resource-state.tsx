"use client";

import type { ReactNode } from "react";

interface ResourceStateProps {
  loading: boolean;
  error: string | null;
  retry: () => void;
  children: ReactNode;
}

export function ResourceState({
  loading,
  error,
  retry,
  children,
}: ResourceStateProps) {
  // Se muestra un estado por vez: carga, error o contenido disponible.
  if (loading) {
    return (
      <p role="status" aria-live="polite">
        <progress aria-label="Consulta en curso" /> Consultando información del
        SII…
      </p>
    );
  }

  if (error) {
    return (
      <div role="alert">
        <p>{error}</p>
        {/* La acción de reintento pertenece a la pantalla que inició la consulta. */}
        <button type="button" onClick={retry}>
          Reintentar consulta
        </button>
      </div>
    );
  }

  // El contenido se muestra solo cuando terminó la carga sin error.
  return children;
}
