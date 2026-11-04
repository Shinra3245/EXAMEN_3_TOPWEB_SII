// Tipos de respuesta del servidor SII upstream

export interface SiiEnvelope<T = unknown> {
  code: number;
  message: string;
  flag: boolean;
  data: T;
}

export interface SiiLoginResponse {
  message?: {
    login?: {
      token?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  code?: number;
  flag?: boolean;
  data?: unknown;
  [key: string]: unknown;
}

export interface SiiRawStudent {
  numero_control?: string;
  email?: string;
  semestre?: number | string;
  foto?: string;
  [key: string]: unknown;
}

export interface SiiRawKardexItem {
  nombre_materia?: string;
  clave_materia?: string;
  periodo?: string;
  creditos?: string | number;
  calificacion?: string | number | null;
  descripcion?: string;
  semestre?: number | string;
  [key: string]: unknown;
}

export interface SiiRawKardexResponse {
  kardex?: SiiRawKardexItem[];
  [key: string]: unknown;
}

export interface SiiRawGradeEntry {
  periodo?: Record<string, unknown>;
  materias?: Array<{
    materia?: {
      nombre_materia?: string;
      clave_materia?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export interface SiiRawScheduleItem {
  nombre_materia?: string;
  clave_materia?: string;
  lunes?: string | null;
  martes?: string | null;
  miercoles?: string | null;
  jueves?: string | null;
  viernes?: string | null;
  sabado?: string | null;
  [key: string]: unknown;
}

export interface SiiRawScheduleEntry {
  periodo?: Record<string, unknown>;
  horario?: SiiRawScheduleItem[];
  [key: string]: unknown;
}
