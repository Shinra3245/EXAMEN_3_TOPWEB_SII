// Tipos de respuesta del servidor SII upstream

export interface SiiEnvelope<T = unknown> {
  code: number;
  message: string;
  flag: boolean;
  data: T;
}

// El login puede responder solo con code/flag si falla; se permiten claves
// adicionales porque la estructura del upstream no es completamente estable.
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

// El SII alterna semestre entre número y texto. Las claves extra permiten
// tolerar campos nuevos que los normalizadores no consumen.
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

// El normalizador valida periodo en tiempo de ejecución. El upstream escribe
// `calificaiones`; ese campo se lee sin tiparlo aquí para evitar acoplar el DTO.
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
