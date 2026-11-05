import {calculateFinal} from "./final-grade";
import type { GradesPeriodDTO } from "@/types/normalizers";
import {records,object,text,grade,numberOrNull,periodo} from "./shared";
export function normalizeGrades(raw:unknown):GradesPeriodDTO[]{
 return records(raw).map(entry=>({periodo:periodo(entry.periodo),materias:records(entry.materias).map(item=>{
  const materia=object(item.materia);
  // Clave institucional observada en E10: el error ortográfico es parte del contrato.
  const evaluaciones=records(item.calificaiones).map(row=>({numero_calificacion:numberOrNull(row.numero_calificacion),calificacion:grade(row.calificacion)}));
  return {nombre_materia:text(materia.nombre_materia),clave_materia:text(materia.clave_materia),...calculateFinal(evaluaciones),evaluaciones};
 })}));
}
