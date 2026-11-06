import type { StudentProfileDTO } from "@/types/normalizers";
import { UpstreamError } from "../errors";
import { decimalOrNull, numberOrNull, object, text } from "./shared";

// Lista estable de indicadores esperados por el consumidor; claves ausentes
// en el upstream se devuelven como null (sin romper el contrato).
const indicatorKeys = [
  "creditos_acumulados",
  "promedio_ponderado",
  "promedio_aritmetico",
  "materias_cursadas",
  "materias_reprobadas",
  "materias_aprobadas",
  "creditos_complementarios",
  "porcentaje_avance",
  "percentaje_avance_cursando",
] as const;

export function normalizeStudentProfile(raw: unknown): StudentProfileDTO {
  const value = object(raw);
  const studentId = text(value.numero_control);

  // El numero_control identifica al estudiante: debe existir y no exceder
  // 64 caracteres (cota de sanidad para evitar entradas anómalas).
  if (!studentId || studentId.length > 64) {
    throw new UpstreamError(
      502,
      "INVALID_STUDENT_IDENTITY",
      "Identidad institucional no confirmada",
    );
  }

  const indicators = Object.fromEntries(
    indicatorKeys.map((key) => [key, decimalOrNull(value[key])]),
  );

  return {
    persona: text(value.persona) || null,
    indicadores: indicators,
    numero_control: studentId,
    email: text(value.email),
    semestre: numberOrNull(value.semestre),
    foto: text(value.foto),
  };
}
