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
        <button type="button" onClick={retry}>
          Reintentar consulta
        </button>
      </div>
    );
  }

  return children;
}
