// Tipos DTO normalizados para consumo del cliente frontend

export interface PeriodoDTO { clave_periodo: string; anio: number | null; descripcion_periodo: string; }
export type DiaSemana = "lunes" | "martes" | "miercoles" | "jueves" | "viernes" | "sabado";
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

export interface NormalizedGradeMateria {
  nombre_materia: string;
  clave_materia: string;
  resultadoFinal: null;
  evaluaciones: Array<{ numero_calificacion: number | null; calificacion: string | null }>;
}

export interface GradesPeriodDTO {
  periodo: PeriodoDTO | null;
  materias: NormalizedGradeMateria[];
}

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
