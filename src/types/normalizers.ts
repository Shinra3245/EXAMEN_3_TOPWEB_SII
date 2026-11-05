// Tipos DTO normalizados para consumo del cliente frontend

export interface StudentProfileDTO {
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
  kardex: KardexItemDTO[];
}

export interface NormalizedGradeMateria {
  nombre_materia: string;
  clave_materia: string;
  resultadoFinal: null;
  evaluaciones: Array<{ calificacion: string | null }>;
}

export interface GradesPeriodDTO {
  periodo: null;
  materias: NormalizedGradeMateria[];
}

export interface ScheduleItemDTO {
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
  periodo: null;
  horario: ScheduleItemDTO[];
}
