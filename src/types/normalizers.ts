// Tipos DTO normalizados para consumo del cliente frontend

export interface PeriodoDTO { clave_periodo: string; anio: number | null; descripcion_periodo: string; }
export type DiaSemana = "lunes" | "martes" | "miercoles" | "jueves" | "viernes" | "sabado";
// `salon` es null cuando hay horario para ese día, pero falta la clave del salón.
export interface SesionHorarioDTO { dia: DiaSemana; inicio: string; fin: string; salon: string | null; }

export interface StudentProfileDTO {
  persona: string | null;
  indicadores: Record<string, number | null>;
  numero_control: string;
  email: string;
  semestre: number | null;
  foto: string;
}

export interface KardexItemDTO {
  nombre_materia: string;
  clave_materia: string;
  periodo: string;
  creditos: string;
  calificacion: string | null;
  descripcion: string;
  semestre: number | null;
}

export interface KardexDTO {
  porcentaje_avance: number | null;
  kardex: KardexItemDTO[];
}

// Resultado local, no oficial del SII; origenFinal es null si queda pendiente
// y motivoFinal explica por qué no pudo calcularse.
export interface FinalCalculationDTO {
  resultadoFinal: number | null;
  estadoFinal: "calculada" | "pendiente";
  origenFinal: "calculada" | null;
  motivoFinal: "parciales_incompletos" | "numeracion_invalida" | "evaluaciones_duplicadas" | "calificaciones_invalidas" | null;
  reglaFinal: "promedio_4_parciales_redondeo_entero";
}

export interface NormalizedGradeMateria extends FinalCalculationDTO {
  nombre_materia: string;
  clave_materia: string;
  evaluaciones: Array<{ numero_calificacion: number | null; calificacion: string | null }>;
}

export interface GradesPeriodDTO {
  periodo: PeriodoDTO | null;
  materias: NormalizedGradeMateria[];
}

// Conserva el valor original de cada día: los rangos interpretados quedan en
// `sesiones` y los valores no reconocidos se indican en `diasNoInterpretados`.
export interface ScheduleItemDTO {
  sesiones: SesionHorarioDTO[];
  diasNoInterpretados: DiaSemana[];
  nombre_materia: string;
  clave_materia: string;
  lunes: string | null;
  martes: string | null;
  miercoles: string | null;
  jueves: string | null;
  viernes: string | null;
  sabado: string | null;
}

export interface SchedulePeriodDTO {
  periodo: PeriodoDTO | null;
  horario: ScheduleItemDTO[];
}
