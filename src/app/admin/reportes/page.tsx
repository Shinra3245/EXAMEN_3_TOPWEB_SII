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
    return <p>Cargando perfil...</p>;
  }

  if (!esAdmin) {
    return (
      <section role="alert" className="p-8 text-center">
        <h1 className="text-xl font-bold text-red-700">Acceso no autorizado</h1>
        <p className="mt-2 text-gray-600">
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
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Gestión de reportes (Administrador)</h1>
        <p className="text-gray-600 mt-1">
          Bandeja de administración técnica para revisión, asignación de
          prioridad, cambio de estados y trazabilidad de aulas.
        </p>
      </header>

      {successMsg && (
        <p
          role="status"
          className="mb-4 p-3 bg-green-50 text-green-800 border border-green-200 rounded"
        >
          {successMsg}
        </p>
      )}

      {/* Resumen de métricas y salones más afectados */}
      {summary && (
        <section
          aria-labelledby="summary-heading"
          className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <div className="border border-gray-200 rounded p-4 bg-gray-50">
            <h2 id="summary-heading" className="text-base font-bold mb-3">
              Resumen de reportes
            </h2>
            <p className="text-2xl font-extrabold text-blue-700">
              {summary.total_reportes} reportes totales
            </p>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div className="p-2 bg-yellow-100 rounded">
                Recibidos: <strong>{summary.por_estado.recibido || 0}</strong>
              </div>
              <div className="p-2 bg-blue-100 rounded">
                En revisión:{" "}
                <strong>{summary.por_estado.en_revision || 0}</strong>
              </div>
              <div className="p-2 bg-green-100 rounded">
                Resueltos: <strong>{summary.por_estado.resuelto || 0}</strong>
              </div>
              <div className="p-2 bg-gray-200 rounded">
                Cerrados: <strong>{summary.por_estado.cerrado || 0}</strong>
              </div>
              <div className="p-2 bg-red-100 rounded">
                Descartados:{" "}
                <strong>{summary.por_estado.descartado || 0}</strong>
              </div>
            </div>
          </div>

          <div className="border border-gray-200 rounded p-4 bg-gray-50">
            <h2 className="text-base font-bold mb-2">
              Salones con más fallas reportadas
            </h2>
            {summary.salones_frecuentes.length === 0 ? (
              <p className="text-xs text-gray-500">Sin reportes registrados aún.</p>
            ) : (
              <ul className="text-xs space-y-1">
                {summary.salones_frecuentes.slice(0, 5).map((room) => (
                  <li
                    key={room.salon}
                    className="flex justify-between border-b border-gray-200 py-1"
                  >
                    <span className="font-semibold">Aula {room.salon}</span>
                    <span>
                      {room.total_reportes} total ({room.abiertos} abiertos,{" "}
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
          <h2 id="bandeja-heading" className="text-lg font-bold mb-4">
            Bandeja de atención ({reports.length})
          </h2>

          <div className="table-scroll">
            <table>
              <caption>Lista completa de reportes de aulas con datos de auditoría</caption>
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
                      <strong>{report.salon}</strong>
                      <br />
                      <small>{report.clave_materia}</small>
                    </td>
                    <td>{report.tipo_nombre}</td>
                    <td>
                      <span className="capitalize font-semibold">
                        {report.estado.replace("_", " ")}
                      </span>
                    </td>
                    <td>{report.prioridad || "-"}</td>
                    <td>
                      <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                        {report.reporter_id || "No disponible"}
                      </code>
                    </td>
                    <td>
                      {report.apoyos_conteo}
                      {report.apoyos_estudiantes &&
                        report.apoyos_estudiantes.length > 0 && (
                          <div className="text-[10px] text-gray-500 max-w-xs truncate">
                            {report.apoyos_estudiantes.join(", ")}
                          </div>
                        )}
                    </td>
                    <td>
                      <small>
                        {new Date(report.creado_en).toLocaleDateString("es-MX")}
                      </small>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => openManageModal(report)}
                        className="text-xs"
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
          <div className="w-full max-w-lg rounded border border-gray-300 bg-white p-6 shadow-lg max-h-[90vh] overflow-y-auto">
            <h2 id="manage-modal-title" className="text-xl font-bold mb-3">
              Gestionar reporte: Aula {selectedReport.salon}
            </h2>

            <div className="mb-4 rounded bg-gray-50 p-3 text-xs border border-gray-200">
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
                <p role="alert" className="text-sm font-semibold text-red-700">
                  {modalError}
                </p>
              )}

              <div>
                <label htmlFor="nuevo-estado" className="block text-sm font-semibold mb-1">
                  Estado:
                </label>
                <select
                  id="nuevo-estado"
                  value={nuevoEstado}
                  onChange={(e) =>
                    setNuevoEstado(e.target.value as ReportEstado)
                  }
                  className="w-full"
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
                <label
                  htmlFor="nueva-prioridad"
                  className="block text-sm font-semibold mb-1"
                >
                  Prioridad:
                </label>
                <select
                  id="nueva-prioridad"
                  value={nuevaPrioridad}
                  onChange={(e) =>
                    setNuevaPrioridad(e.target.value as ReportPrioridad | "")
                  }
                  className="w-full"
                >
                  <option value="">Sin prioridad asignada</option>
                  <option value="baja">Baja</option>
                  <option value="media">Media</option>
                  <option value="alta">Alta</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="comentario-gestion"
                  className="block text-sm font-semibold mb-1"
                >
                  Comentario de seguimiento (obligatorio):
                </label>
                <textarea
                  id="comentario-gestion"
                  rows={3}
                  value={comentario}
                  maxLength={1000}
                  onChange={(e) => setComentario(e.target.value)}
                  placeholder="Explica el avance, motivo de descarte o solución aplicada..."
                  className="w-full"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={closeManageModal}
                  disabled={updating}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={updating || !comentario.trim()}
                >
                  {updating ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </>
  );
}
