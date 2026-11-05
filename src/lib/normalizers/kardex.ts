import type { KardexDTO } from "@/types/normalizers";
import { object,records,text,numberOrNull,grade,decimalOrNull } from "./shared";
export function normalizeKardex(raw: unknown): KardexDTO {
  const rows=records(Array.isArray(raw)?raw:object(raw).kardex);
  return {porcentaje_avance:Array.isArray(raw)?null:decimalOrNull(object(raw).porcentaje_avance),kardex:rows.map(item=>({
    nombre_materia:text(item.nombre_materia),clave_materia:text(item.clave_materia),periodo:text(item.periodo),
    creditos:grade(item.creditos)??"",calificacion:grade(item.calificacion),descripcion:text(item.descripcion),semestre:numberOrNull(item.semestre),
  }))};
}
