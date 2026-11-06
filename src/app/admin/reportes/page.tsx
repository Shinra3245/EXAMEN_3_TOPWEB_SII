"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useResource } from "@/hooks/use-resource";
import { ResourceState } from "@/components/resource-state";
import { Modal } from "@/components/modal";
import { apiRequest, ApiClientError } from "@/lib/api-client";
import type {
  RoomReportDTO,
  ReportsSummaryDTO,
  ReportEstado,
  ReportPrioridad,
} from "@/types/api";
import {
  IconAdminReportes,
  IconCheck,
  IconAlert,
} from "@/components/visual-icons";

const VALID_ESTADOS: ReportEstado[] = [
  "recibido",
  "en_revision",
  "resuelto",
  "cerrado",
  "descartado",
];

const VALID_PRIORIDADES: Array<ReportPrioridad | ""> = [
  "",
  "baja",
  "media",
  "alta",
];

export default function AdminReportsPage() {
  const { esAdmin, status } = useAuth();

  const summaryResource =
    useResource<ReportsSummaryDTO>("/api/admin/reports/summary");
  const reportsResource = useResource<RoomReportDTO[]>("/api/reports");

  const [selectedReport, setSelectedReport] = useState<RoomReportDTO | null>(
    null
  );
  const [nuevoEstado, setNuevoEstado] = useState<ReportEstado>("en_revision");
  const [nuevaPrioridad, setNuevaPrioridad] = useState<ReportPrioridad | "">("");
  const [comentario, setComentario] = useState("");
  const [updating, setUpdating] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (status === "loading") {
    return (
      <div className="visual-card p-8 text-center text-muted">
        <p className="font-semibold">Cargando perfil administrativo...</p>
      </div>
    );
  }

  if (!esAdmin) {
    return (
      <section role="alert" className="visual-card p-8 text-center border-red-300">
        <h1 className="text-xl font-bold text-red-700">Acceso no autorizado</h1>
        <p className="mt-2 text-muted">
          Esta sección está restringida exclusivamente a administradores
          designados en la plataforma.
        </p>
      </section>
    );
  }

  const openManageModal = (report: RoomReportDTO) => {
    setSelectedReport(report);
    setNuevoEstado(
      report.estado === "recibido"
        ? "en_revision"
        : report.estado === "en_revision"
        ? "resuelto"
        : report.estado
    );
    setNuevaPrioridad(report.prioridad || "");
    setComentario("");
    setModalError(null);
  };

  const closeManageModal = () => {
    setSelectedReport(null);
    setComentario("");
    setModalError(null);
    setUpdating(false);
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReport) return;
    const trimmedComment = comentario.trim();
    if (!trimmedComment) {
      setModalError("El comentario es obligatorio para registrar la acción.");
      return;
    }

    setUpdating(true);
    setModalError(null);
    try {
      await apiRequest<{ message: string }>("/api/admin/reports/update", {
        method: "POST",
        body: JSON.stringify({
          report_id: selectedReport.id,
          estado: nuevoEstado,
          prioridad: nuevaPrioridad ? nuevaPrioridad : null,
          comentario: trimmedComment,
        }),
      });
      setSuccessMsg("Reporte actualizado correctamente.");
      closeManageModal();
      void reportsResource.refresh();
      void summaryResource.refresh();
    } catch (err: unknown) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Fallo al actualizar el reporte";
      setModalError(msg);
    } finally {
      setUpdating(false);
    }
  };

  const summary = summaryResource.data;
  const reports = reportsResource.data ?? [];

  return (
    <div className="admin-reports-view flex flex-col gap-6">
      <header>
        <div className="flex items-center gap-3">
          <IconAdminReportes size={26} className="text-blue-600" />
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Gestión de reportes (Administrador)
          </h1>
        </div>
        <p className="text-sm text-muted mt-1 max-w-2xl">
          Bandeja de administración técnica para revisión, asignación de
          prioridad, cambio de estados y trazabilidad de aulas.
        </p>
      </header>

      {successMsg && (
        <div
          role="status"
          className="notice-box notice-success"
        >
          <IconCheck size={18} className="text-green-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Resumen de métricas y salones más afectados */}
      {summary && (
        <section
          aria-labelledby="summary-heading"
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <div className="visual-card p-5 flex flex-col justify-between">
            <div>
              <h2 id="summary-heading" className="text-base font-bold mb-2">
                Resumen de reportes
              </h2>
              <p className="text-3xl font-black text-blue-700">
                {summary.total_reportes} reportes totales
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div className="p-2 bg-yellow-100 text-yellow-900 rounded font-semibold">
                Recibidos: <strong>{summary.por_estado.recibido || 0}</strong>
              </div>
              <div className="p-2 bg-blue-100 text-blue-900 rounded font-semibold">
                En revisión:{" "}
                <strong>{summary.por_estado.en_revision || 0}</strong>
              </div>
              <div className="p-2 bg-green-100 text-green-900 rounded font-semibold">
                Resueltos: <strong>{summary.por_estado.resuelto || 0}</strong>
              </div>
              <div className="p-2 bg-gray-200 text-gray-800 rounded font-semibold">
                Cerrados: <strong>{summary.por_estado.cerrado || 0}</strong>
              </div>
              <div className="p-2 bg-red-100 text-red-900 rounded font-semibold">
                Descartados:{" "}
                <strong>{summary.por_estado.descartado || 0}</strong>
              </div>
            </div>
          </div>

          <div className="visual-card p-5">
            <h2 className="text-base font-bold mb-3">
              Salones con más fallas reportadas
            </h2>
            {summary.salones_frecuentes.length === 0 ? (
              <p className="text-xs text-muted">Sin reportes registrados aún.</p>
            ) : (
              <ul className="text-xs space-y-2 list-none p-0 m-0">
                {summary.salones_frecuentes.slice(0, 5).map((room) => (
                  <li
                    key={room.salon}
                    className="flex justify-between items-center border-b border-[var(--surface-border)] pb-1.5"
                  >
                    <span className="font-bold text-sm">Aula {room.salon}</span>
                    <span className="text-muted">
                      <strong>{room.total_reportes}</strong> total ({room.abiertos} abiertos,{" "}
                      {room.resueltos} resueltos)
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* Lista de reportes en bandeja de admin */}
      <ResourceState
        {...reportsResource}
        retry={() => {
          void reportsResource.refresh();
          void summaryResource.refresh();
        }}
      >
        <section aria-labelledby="bandeja-heading">
          <div className="flex items-center justify-between mb-2">
            <h2 id="bandeja-heading" className="text-lg font-bold">
              Bandeja de atención ({reports.length})
            </h2>
          </div>

          <div className="table-scroll">
            <table>
              <caption>
                Lista completa de reportes de aulas con datos de auditoría
              </caption>
              <thead>
                <tr>
                  <th scope="col">Aula</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Prioridad</th>
                  <th scope="col">Reportante</th>
                  <th scope="col">Apoyos</th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Acción</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id}>
                    <td>
                      <span className="font-bold block">
                        Aula {report.salon}
                      </span>
                      <small className="text-xs text-muted block font-mono">
                        {report.clave_materia}
                      </small>
                    </td>
                    <td className="text-sm">{report.tipo_nombre}</td>
                    <td>
                      <span className={`report-status report-status-${report.estado}`}>
                        {report.estado.replace("_", " ")}
                      </span>
                    </td>
                    <td>
                      {report.prioridad ? (
                        <span className="text-xs font-bold capitalize">
                          {report.prioridad}
                        </span>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td>
                      <code className="text-xs px-1.5 py-0.5 rounded bg-[var(--surface-secondary)] border border-[var(--surface-border)] font-mono">
                        {report.reporter_id || "No disponible"}
                      </code>
                    </td>
                    <td>
                      <span className="font-bold">{report.apoyos_conteo}</span>
                      {report.apoyos_estudiantes &&
                        report.apoyos_estudiantes.length > 0 && (
                          <div className="text-[10px] text-muted max-w-xs truncate">
                            {report.apoyos_estudiantes.join(", ")}
                          </div>
                        )}
                    </td>
                    <td className="text-xs text-muted whitespace-nowrap">
                      {new Date(report.creado_en).toLocaleDateString("es-MX")}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => openManageModal(report)}
                        className="btn-secondary text-xs"
                      >
                        Gestionar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </ResourceState>

      {/* Modal accesible de gestión para Administrador */}
      {selectedReport && (
        <Modal
          titleId="manage-modal-title"
          onDismiss={closeManageModal}
          dismissible={!updating}
        >
          <div className="modal-dialog-panel">
            <h2 id="manage-modal-title" className="modal-title">
              <IconAdminReportes size={22} />
              <span>Gestionar reporte: Aula {selectedReport.salon}</span>
            </h2>

            <div className="p-3 bg-[var(--surface-secondary)] border border-[var(--surface-border)] rounded text-xs flex flex-col gap-1">
              <p>
                <strong>Tipo:</strong> {selectedReport.tipo_nombre}
              </p>
              <p>
                <strong>Reportado por:</strong> {selectedReport.reporter_id}
              </p>
              <p>
                <strong>Descripción original:</strong> &quot;
                {selectedReport.descripcion}&quot;
              </p>
            </div>

            <form onSubmit={handleUpdateSubmit} className="flex flex-col gap-4">
              {modalError && (
                <div
                  role="alert"
                  className="notice-box notice-error"
                >
                  <IconAlert size={18} className="text-red-600" />
                  <span>{modalError}</span>
                </div>
              )}

              <div>
                <label htmlFor="nuevo-estado">
                  Estado del reporte:
                </label>
                <select
                  id="nuevo-estado"
                  value={nuevoEstado}
                  onChange={(e) =>
                    setNuevoEstado(e.target.value as ReportEstado)
                  }
                  className="w-full mt-1"
                  required
                >
                  {VALID_ESTADOS.map((st) => (
                    <option key={st} value={st}>
                      {st.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="nueva-prioridad">
                  Prioridad técnica asignada:
                </label>
                <select
                  id="nueva-prioridad"
                  value={nuevaPrioridad}
                  onChange={(e) =>
                    setNuevaPrioridad(e.target.value as ReportPrioridad | "")
                  }
                  className="w-full mt-1"
                >
                  <option value="">Sin prioridad asignada</option>
                  <option value="baja">Baja</option>
                  <option value="media">Media</option>
                  <option value="alta">Alta</option>
                </select>
              </div>

              <div>
                <label htmlFor="comentario-gestion">
                  Comentario de seguimiento (obligatorio):
                </label>
                <textarea
                  id="comentario-gestion"
                  rows={3}
                  value={comentario}
                  maxLength={1000}
                  onChange={(e) => setComentario(e.target.value)}
                  placeholder="Explica el avance, motivo de descarte o solución aplicada..."
                  className="w-full mt-1"
                  required
                />
              </div>

              <div className="flex justify-end gap-3 mt-2">
                <button
                  type="button"
                  onClick={closeManageModal}
                  disabled={updating}
                  className="btn-secondary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={updating || !comentario.trim()}
                  className="btn-primary"
                >
                  {updating ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </div>
  );
}
