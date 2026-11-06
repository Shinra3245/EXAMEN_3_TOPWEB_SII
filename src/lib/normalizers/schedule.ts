import type {
  DiaSemana,
  SchedulePeriodDTO,
  SesionHorarioDTO,
} from "@/types/normalizers";
import { periodo, records, text } from "./shared";

const days: DiaSemana[] = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
];

function parseTimeRange(value: string): { inicio: string; fin: string } | null {
  // Acepta "HH:MM", "H:MM", con guion normal o en dash, y segundos opcionales.
  const match =
    /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*[-–]\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(
      value.trim(),
    );
  if (!match) return null;

  const [
    startHour,
    startMinute,
    startSecond,
    endHour,
    endMinute,
    endSecond,
  ] = match.slice(1).map((part) => Number(part ?? 0));

  // Rechaza rangos inválidos o vacíos (inicio >= fin) y descarta segundos
  // distintos de cero porque el DTO solo modela HH:MM.
  if (
    startHour > 23 ||
    endHour > 23 ||
    startMinute > 59 ||
    endMinute > 59 ||
    startSecond !== 0 ||
    endSecond !== 0 ||
    startHour * 60 + startMinute >= endHour * 60 + endMinute
  ) {
    return null;
  }

  const formatTime = (hour: number, minute: number) =>
    `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  return {
    inicio: formatTime(startHour, startMinute),
    fin: formatTime(endHour, endMinute),
  };
}

function dayValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function normalizeSchedule(raw: unknown): SchedulePeriodDTO[] {
  return records(raw).map((entry) => ({
    periodo: periodo(entry.periodo),
    horario: records(entry.horario).map((item) => {
      const sesiones: SesionHorarioDTO[] = [];
      const diasNoInterpretados: DiaSemana[] = [];

      for (const day of days) {
        const value = item[day];
        // Celdas vacías se ignoran: no son error ni sesión.
        if (
          value === null ||
          value === undefined ||
          value === "" ||
          (typeof value === "string" && !value.trim())
        ) {
          continue;
        }

        const timeRange =
          typeof value === "string" ? parseTimeRange(value) : null;
        if (timeRange) {
          sesiones.push({
            dia: day,
            ...timeRange,
            salon: text(item[`${day}_clave_salon`]) || null,
          });
        } else {
          // Valor no interpretable: se conserva el día en el reporte y el
          // valor crudo permanece en los campos día (lunes, martes, ...).
          diasNoInterpretados.push(day);
        }
      }

      return {
        nombre_materia: text(item.nombre_materia),
        clave_materia: text(item.clave_materia),
        sesiones,
        diasNoInterpretados,
        lunes: dayValue(item.lunes),
        martes: dayValue(item.martes),
        miercoles: dayValue(item.miercoles),
        jueves: dayValue(item.jueves),
        viernes: dayValue(item.viernes),
        sabado: dayValue(item.sabado),
      };
    }),
  }));
}
