"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useResource } from "@/hooks/use-resource";
import { ResourceState } from "@/components/resource-state";
import { apiRequest, ApiClientError } from "@/lib/api-client";
import type { RoomReportDTO, FaultTypeDTO, ReportEstado } from "@/types/api";

const ESTADOS_OPCIONES: Array<{ value: string; label: string }> = [
  { value: "", label: "Todos los estados" },
  { value: "recibido", label: "Recibido" },
  { value: "en_revision", label: "En revisión" },
  { value: "resuelto", label: "Resuelto" },
  { value: "cerrado", label: "Cerrado" },
  { value: "descartado", label: "Descartado" },
];

export default function ReportsPage() {
  const [filterSalon, setFilterSalon] = useState("");
  const [filterTipoId, setFilterTipoId] = useState("");
  const [filterEstado, setFilterEstado] = useState("");
  const [filterPeriodo, setFilterPeriodo] = useState("");
  const [filterMine, setFilterMine] = useState(false);

  // Generar URL con filtros
  const queryUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (filterSalon.trim()) params.set("salon", filterSalon.trim());
    if (filterTipoId) params.set("tipo_id", filterTipoId);
    if (filterEstado) params.set("estado", filterEstado);
    if (filterPeriodo.trim()) params.set("periodo", filterPeriodo.trim());
    if (filterMine) params.set("mine", "1");
    const q = params.toString();
    return q ? `/api/reports?${q}` : "/api/reports";
  }, [filterSalon, filterTipoId, filterEstado, filterPeriodo, filterMine]);

  const reportsResource = useResource<RoomReportDTO[]>(queryUrl);
  const typesResource = useResource<FaultTypeDTO[]>("/api/report-types");

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});

  const toggleHistory = (id: string) => {
    setExpandedHistory((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleConfirm = async (reportId: string) => {
    setLoadingActionId(reportId);
    setActionError(null);
    setActionSuccess(null);
    try {
      await apiRequest<{ message: string }>("/api/reports/confirm", {
        method: "POST",
        body: JSON.stringify({ report_id: reportId }),
      });
      setActionSuccess("¡Apoyo registrado exitosamente! Gracias por confirmar.");
      void reportsResource.refresh();
    } catch (err: unknown) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Fallo al apoyar el reporte";
      setActionError(msg);
    } finally {
      setLoadingActionId(null);
    }
  };

  const handleWithdraw = async (reportId: string) => {
    if (!window.confirm("¿Estás seguro de que deseas retirar este reporte?")) {
      return;
    }
    setLoadingActionId(reportId);
    setActionError(null);
    setActionSuccess(null);
    try {
      await apiRequest<{ message: string }>("/api/reports/withdraw", {
        method: "POST",
        body: JSON.stringify({ report_id: reportId }),
      });
      setActionSuccess("Reporte retirado exitosamente.");
      void reportsResource.refresh();
    } catch (err: unknown) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Fallo al retirar el reporte";
      setActionError(msg);
    } finally {
      setLoadingActionId(null);
    }
  };

  const reports = reportsResource.data ?? [];

  return (
    <div className="report-page">
      <header className="report-page-header mb-6">
        <h1 className="text-2xl font-bold">Reportes de fallas en aulas</h1>
        <p className="text-gray-600 mt-1">
          Consulta y apoya reportes de fallas físicas y técnicas en las aulas.
          Los reportes se originan desde la clase correspondiente en tu{" "}
          <Link href="/horario" className="text-blue-600 underline">
            Horario
          </Link>
          .
        </p>
      </header>

      {/* Barra de filtros */}
      <section
        aria-labelledby="filtros-heading"
        className="report-filter-panel controls mb-6"
      >
        <h2 id="filtros-heading" className="sr-only">
          Filtros de búsqueda
        </h2>
        <div className="flex flex-wrap gap-4 items-end">
          <label className="flex flex-col text-sm font-medium">
            Salón:
            <input
              type="text"
              placeholder="Ej. A-12, Lab 3"
              value={filterSalon}
              onChange={(e) => setFilterSalon(e.target.value)}
              className="mt-1"
            />
          </label>

          <label className="flex flex-col text-sm font-medium">
            Tipo de falla:
            <select
              value={filterTipoId}
              onChange={(e) => setFilterTipoId(e.target.value)}
              className="mt-1"
            >
              <option value="">Todos los tipos</option>
              {typesResource.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col text-sm font-medium">
            Estado:
            <select
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value)}
              className="mt-1"
            >
              {ESTADOS_OPCIONES.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col text-sm font-medium">
            Periodo:
            <input
              type="text"
              placeholder="Ej. Ago-Dic 2026"
              value={filterPeriodo}
              onChange={(e) => setFilterPeriodo(e.target.value)}
              className="mt-1"
            />
          </label>

          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer pb-2">
            <input
              type="checkbox"
              checked={filterMine}
              onChange={(e) => setFilterMine(e.target.checked)}
              className="h-4 w-4"
            />
            Solo mis reportes
          </label>

          <button
            type="button"
            onClick={() => {
              setFilterSalon("");
              setFilterTipoId("");
              setFilterEstado("");
              setFilterPeriodo("");
              setFilterMine(false);
            }}
            className="self-end"
          >
            Limpiar filtros
          </button>
        </div>
      </section>

      {/* Avisos de acción */}
      {actionSuccess && (
        <p
          role="status"
          className="feedback feedback-success mb-4 p-3 bg-green-50 text-green-800 border border-green-200 rounded"
        >
          {actionSuccess}
        </p>
      )}
      {actionError && (
        <p
          role="alert"
          className="feedback feedback-error mb-4 p-3 bg-red-50 text-red-800 border border-red-200 rounded"
        >
          {actionError}
        </p>
      )}

      {/* Lista de reportes */}
      <ResourceState
        {...reportsResource}
        retry={() => {
          void reportsResource.refresh();
        }}
      >
        <div className="report-count mb-2 text-sm text-gray-600">
          Mostrando {reports.length} {reports.length === 1 ? "reporte" : "reportes"}.
        </div>

        {reports.length === 0 ? (
          <div className="report-empty-state p-8 text-center border border-dashed border-gray-300 rounded">
            <p className="text-gray-500">
              No se encontraron reportes con los criterios seleccionados.
            </p>
            <p className="text-sm text-gray-400 mt-1">
              Si detectas un desperfecto en tu aula, repórtalo directamente desde tu{" "}
              <Link href="/horario" className="text-blue-600 underline">
                horario de clases
              </Link>
              .
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-4 list-none p-0 m-0">
            {reports.map((report) => {
              const isOpen =
                report.estado === "recibido" || report.estado === "en_revision";
              const isExpanded = Boolean(expandedHistory[report.id]);
              const isLoading = loadingActionId === report.id;

              return (
                <li
                  key={report.id}
                  className="report-card border border-gray-200 rounded p-4 bg-white shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-gray-100 pb-3">
                    <div>
                      <span className="text-lg font-bold">
                        Aula {report.salon}
                      </span>
                      <span className="ml-3 inline-block px-2 py-0.5 text-xs font-semibold rounded bg-gray-100 text-gray-800">
                        {report.tipo_nombre}
                      </span>
                      <div className="text-sm text-gray-600 mt-1">
                        <span>{report.nombre_materia}</span> ({report.clave_materia}) •{" "}
                        <span className="capitalize">{report.dia}</span> {report.hora_inicio} - {report.hora_fin} •{" "}
                        <span>{report.periodo}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`report-status report-status-${report.estado} inline-block px-2.5 py-1 text-xs font-bold uppercase rounded ${
                          report.estado === "resuelto"
                            ? "bg-green-100 text-green-800"
                            : report.estado === "en_revision"
                            ? "bg-blue-100 text-blue-800"
                            : report.estado === "recibido"
                            ? "bg-yellow-100 text-yellow-800"
                            : report.estado === "descartado"
                            ? "bg-red-100 text-red-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {report.estado.replace("_", " ")}
                      </span>
                      {report.prioridad && (
                        <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded bg-purple-50 text-purple-700 border border-purple-200">
                          Prioridad: {report.prioridad}
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="mt-3 text-gray-800 whitespace-pre-line">
                    {report.descripcion}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-4">
                      <span>
                        Reportado: {new Date(report.creado_en).toLocaleString("es-MX")}
                      </span>
                      <span>
                        <strong>{report.apoyos_conteo}</strong>{" "}
                        {report.apoyos_conteo === 1 ? "alumno afectado" : "alumnos afectados"}
                      </span>
                      {report.es_mio && (
                        <span className="text-blue-700 font-semibold">
                          (Tu reporte)
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Botón de apoyo */}
                      {report.lo_apoye ? (
                        <span className="text-green-700 font-semibold px-2 py-1">
                          ✓ Apoyado
                        </span>
                      ) : report.es_mio ? (
                        <span className="text-gray-400 px-2 py-1">
                          Autor
                        </span>
                      ) : isOpen ? (
                        <button
                          type="button"
                          onClick={() => handleConfirm(report.id)}
                          disabled={isLoading}
                          aria-label={`Apoyar reporte de falla en aula ${report.salon}`}
                          className="text-xs"
                        >
                          {isLoading ? "Registrando..." : "También me pasa"}
                        </button>
                      ) : (
                        <span className="text-gray-400 px-2 py-1">
                          Reporte cerrado
                        </span>
                      )}

                      {/* Botón retirar propio reporte si está en 'recibido' */}
                      {report.es_mio && report.estado === "recibido" && (
                        <button
                          type="button"
                          onClick={() => handleWithdraw(report.id)}
                          disabled={isLoading}
                          className="text-xs text-red-600 hover:text-red-800"
                          aria-label={`Retirar tu reporte en aula ${report.salon}`}
                        >
                          Retirar
                        </button>
                      )}

                      {/* Ver historial de eventos */}
                      {report.historial && report.historial.length > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleHistory(report.id)}
                          className="text-xs text-gray-700"
                        >
                          {isExpanded ? "Ocultar historial" : `Historial (${report.historial.length})`}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Panel expandible de historial */}
                  {isExpanded && report.historial && report.historial.length > 0 && (
                    <div className="report-history mt-3 pt-3 border-t border-gray-200 bg-gray-50 p-3 rounded">
                      <h3 className="text-xs font-bold uppercase text-gray-700 mb-2">
                        Historial de seguimiento
                      </h3>
                      <ol className="list-decimal list-inside space-y-2 text-xs text-gray-700">
                        {report.historial.map((ev) => (
                          <li key={ev.id}>
                            <span className="font-semibold">
                              {new Date(ev.creado_en).toLocaleString("es-MX")}
                            </span>
                            : Cambiado a <strong>{ev.estado_nuevo}</strong>
                            {ev.prioridad_nueva && (
                              <span> (Prioridad: {ev.prioridad_nueva})</span>
                            )}
                            . Comentario: &quot;{ev.comentario}&quot;
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </ResourceState>
    </div>
  );
}
