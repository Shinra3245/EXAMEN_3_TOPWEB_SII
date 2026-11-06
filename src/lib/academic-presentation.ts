import type { PeriodoDTO } from "@/types/normalizers";

export function periodLabel(period: PeriodoDTO | null): string {
  if (!period) return "Periodo no disponible";

  const label = [
    period.descripcion_periodo,
    period.clave_periodo,
    period.anio,
  ]
    .filter((value) => value !== null && value !== "")
    .join(" · ");

  return label || "Periodo no disponible";
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
}

export function matchesSubject(
  name: string,
  code: string,
  query: string,
): boolean {
  const subject = normalizeSearchText(`${name} ${code}`);
  const normalizedQuery = normalizeSearchText(query.trim());

  return subject.includes(normalizedQuery);
}

interface GradeLevel {
  label: string;
  level: string;
}

export function gradeLevel(value: number | null): GradeLevel {
  if (value === null || !Number.isFinite(value) || value < 0 || value > 100) {
    return { label: "Pendiente", level: "pending" };
  }

  if (value >= 90) return { label: "Verde: 90–100", level: "green" };
  if (value >= 70) return { label: "Amarillo: 70–89", level: "yellow" };

  return { label: "Rojo: menor de 70", level: "red" };
}

export const dayLabels = {
  lunes: "Lunes",
  martes: "Martes",
  miercoles: "Miércoles",
  jueves: "Jueves",
  viernes: "Viernes",
  sabado: "Sábado",
} as const;
