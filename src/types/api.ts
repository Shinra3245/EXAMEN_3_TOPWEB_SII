export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorDetail;
}

export interface DatabaseCheckData {
  connected: boolean;
  read: boolean;
  write: boolean;
  rollback: boolean;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// Tipos para el módulo de reportes de fallas en aulas

export type ReportEstado =
  | "recibido"
  | "en_revision"
  | "resuelto"
  | "cerrado"
  | "descartado";

export type ReportPrioridad = "baja" | "media" | "alta";

export interface FaultTypeDTO {
  id: number;
  nombre: string;
  activo?: boolean;
  creado_en?: string;
}

export interface ReportEventDTO {
  id: string;
  report_id: string;
  actor_admin?: string; // Solo admin
  estado_anterior: ReportEstado | null;
  estado_nuevo: ReportEstado;
  prioridad_anterior: ReportPrioridad | null;
  prioridad_nueva: ReportPrioridad | null;
  comentario: string;
  creado_en: string;
}

export interface RoomReportDTO {
  id: string;
  salon: string;
  clave_materia: string;
  nombre_materia: string;
  dia: string;
  hora_inicio: string;
  hora_fin: string;
  periodo: string;
  tipo_id: number;
  tipo_nombre: string;
  descripcion: string;
  estado: ReportEstado;
  prioridad: ReportPrioridad | null;
  creado_en: string;
  actualizado_en: string;
  apoyos_conteo: number;
  lo_apoye: boolean;
  es_mio: boolean;
  historial: ReportEventDTO[];
  // Campos exclusivos para rol administrador:
  reporter_id?: string;
  apoyos_estudiantes?: string[];
}

export interface CreateReportRequest {
  clave_materia: string;
  dia: string;
  hora_inicio: string;
  hora_fin: string;
  tipo_id: number;
  descripcion: string;
  salon?: string;
  periodo?: string;
  clave_periodo?: string;
}

export interface ConfirmReportRequest {
  report_id: string;
}

export interface WithdrawReportRequest {
  report_id: string;
}

export interface UpdateReportAdminRequest {
  report_id: string;
  estado?: ReportEstado;
  prioridad?: ReportPrioridad | null;
  comentario: string;
}

export interface SaveFaultTypeAdminRequest {
  id?: number;
  nombre: string;
  activo?: boolean;
}

export interface ReportsSummaryDTO {
  total_reportes: number;
  por_estado: Record<ReportEstado, number>;
  salones_frecuentes: Array<{
    salon: string;
    total_reportes: number;
    abiertos: number;
    resueltos: number;
  }>;
}
