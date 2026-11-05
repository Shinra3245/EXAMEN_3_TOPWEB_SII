import type { SchedulePeriodDTO } from "@/types/normalizers";
import { records,text } from "./shared";
export function normalizeSchedule(raw: unknown): SchedulePeriodDTO[] {
  const day=(value:unknown):string|null=>typeof value==="string" && value.trim() ? value : null;
  return records(raw).map(entry=>({periodo:null,horario:records(entry.horario).map(item=>({
    nombre_materia:text(item.nombre_materia),clave_materia:text(item.clave_materia),
    lunes:day(item.lunes),martes:day(item.martes),miercoles:day(item.miercoles),jueves:day(item.jueves),viernes:day(item.viernes),sabado:day(item.sabado),
  }))}));
}
