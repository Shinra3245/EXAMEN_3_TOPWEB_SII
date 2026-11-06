import type { GradesPeriodDTO } from "@/types/normalizers";
import { calculateFinal } from "./final-grade";
import { grade, numberOrNull, object, periodo, records, text } from "./shared";

export function normalizeGrades(raw: unknown): GradesPeriodDTO[] {
  return records(raw).map((entry) => ({
    periodo: periodo(entry.periodo),
    materias: records(entry.materias).map((item) => {
      const materia = object(item.materia);

      // El error ortográfico "calificaiones" forma parte del contrato observado en E10.
      const evaluaciones = records(item.calificaiones).map((row) => ({
        numero_calificacion: numberOrNull(row.numero_calificacion),
        calificacion: grade(row.calificacion),
      }));

      return {
        nombre_materia: text(materia.nombre_materia),
        clave_materia: text(materia.clave_materia),
        ...calculateFinal(evaluaciones),
        evaluaciones,
      };
    }),
  }));
}
