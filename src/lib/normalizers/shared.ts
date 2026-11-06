import type { PeriodoDTO } from "@/types/normalizers";
import { UpstreamError } from "../errors";

// Contrato: si el upstream devuelve una forma inesperada se marca como error
// 502 (INVALID_ACADEMIC_DATA) en lugar de propagar valores parciales.
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new UpstreamError(
      502,
      "INVALID_ACADEMIC_DATA",
      "Estructura académica no reconocida",
    );
  }

  return value as Record<string, unknown>;
}

export function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new UpstreamError(
      502,
      "INVALID_ACADEMIC_DATA",
      "Colección académica no reconocida",
    );
  }

  return value.map(object);
}

export function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// Solo admite enteros >= 0; las cadenas deben ser dígitos puros.
export function numberOrNull(value: unknown): number | null {
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    value = Number(value);
  }

  return typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
    ? value
    : null;
}

export function grade(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);

  return null;
}

// A diferencia de numberOrNull, acepta decimales (ej. porcentajes de avance).
export function decimalOrNull(value: unknown): number | null {
  if (typeof value === "string") {
    const trimmedValue = value.trim();
    if (!/^\d+(?:\.\d+)?$/.test(trimmedValue)) return null;

    value = Number(trimmedValue);
  }

  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export function periodo(value: unknown): PeriodoDTO | null {
  if (value === undefined || value === null) return null;

  const row = object(value);
  return {
    clave_periodo: text(row.clave_periodo),
    anio: numberOrNull(row.anio),
    descripcion_periodo: text(row.descripcion_periodo),
  };
}
