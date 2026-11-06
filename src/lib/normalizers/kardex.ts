import type { KardexDTO } from "@/types/normalizers";
import { decimalOrNull, grade, numberOrNull, object, records, text } from "./shared";

export function normalizeKardex(raw: unknown): KardexDTO {
  // Acepta dos formas observadas: objeto con { kardex, porcentaje_avance }
  // o directamente un array de materias (sin porcentaje de avance).
  const payload = Array.isArray(raw) ? null : object(raw);
  const rows = records(payload ? payload.kardex : raw);

  return {
    porcentaje_avance: payload ? decimalOrNull(payload.porcentaje_avance) : null,
    kardex: rows.map((item) => ({
      nombre_materia: text(item.nombre_materia),
      clave_materia: text(item.clave_materia),
      periodo: text(item.periodo),
      // creditos se expone como string para conservar la forma del origen;
      // se usa "" cuando no hay valor válido.
      creditos: grade(item.creditos) ?? "",
      calificacion: grade(item.calificacion),
      descripcion: text(item.descripcion),
      semestre: numberOrNull(item.semestre),
    })),
  };
}
