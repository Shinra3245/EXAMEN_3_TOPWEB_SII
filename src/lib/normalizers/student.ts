import { UpstreamError } from "../errors";
import type { StudentProfileDTO } from "@/types/normalizers";
import { object,text,numberOrNull,decimalOrNull } from "./shared";
export function normalizeStudentProfile(raw: unknown): StudentProfileDTO {
  const value=object(raw), control=text(value.numero_control);
  if (!control || control.length>64) throw new UpstreamError(502,"INVALID_STUDENT_IDENTITY","Identidad institucional no confirmada");
  const keys=["creditos_acumulados","promedio_ponderado","promedio_aritmetico","materias_cursadas","materias_reprobadas","materias_aprobadas","creditos_complementarios","porcentaje_avance","percentaje_avance_cursando"];
  return {persona:text(value.persona)||null,indicadores:Object.fromEntries(keys.map(key=>[key,decimalOrNull(value[key])])),numero_control:control,email:text(value.email),semestre:numberOrNull(value.semestre),foto:text(value.foto)};
}
