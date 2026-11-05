import type { PeriodoDTO } from "@/types/normalizers";
export function periodLabel(period: PeriodoDTO | null): string {
  if (!period) return "Periodo no disponible";
  return (
    [period.descripcion_periodo, period.clave_periodo, period.anio]
      .filter((v) => v !== null && v !== "")
      .join(" · ") || "Periodo no disponible"
  );
}
export function matchesSubject(
  name: string,
  code: string,
  query: string,
): boolean {
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es");
  return normalize(`${name} ${code}`).includes(normalize(query.trim()));
}
export function gradeLevel(value: number | null): {
  label: string;
  level: string;
} {
  if (value === null || !Number.isFinite(value) || value < 0 || value > 100)
    return { label: "Pendiente", level: "pending" };
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
