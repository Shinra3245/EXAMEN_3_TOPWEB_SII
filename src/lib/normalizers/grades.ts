import type { GradesPeriodDTO } from "@/types/normalizers";
import { records,object,text,grade } from "./shared";
export function normalizeGrades(raw: unknown): GradesPeriodDTO[] {
  return records(raw).map(entry=>({
    // Claves del periodo sin confirmar: no pasar objetos desconocidos al cliente.
    periodo:null,
    materias:records(entry.materias).map(item=>{
      const materia=object(item.materia);
      const candidates=Object.entries(item).filter(([key,value])=>key!=="materia" && Array.isArray(value) && value.every(row=>row && typeof row==="object" && Object.hasOwn(row,"calificacion")));
      const evaluaciones=candidates.length===1 ? records(candidates[0][1]).map(row=>({calificacion:grade(row.calificacion)})) : [];
      return {nombre_materia:text(materia.nombre_materia),clave_materia:text(materia.clave_materia),resultadoFinal:null,evaluaciones};
    }),
  }));
}
