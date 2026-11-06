"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useResource } from "@/hooks/use-resource";
import { ResourceState } from "@/components/resource-state";
import { useVisualTheme, appendVisualParams } from "@/components/visual-theme";
import { apiRequest, ApiClientError } from "@/lib/api-client";
import type { RoomReportDTO, FaultTypeDTO } from "@/types/api";
import {
  IconReportes,
  IconFilter,
  IconSupport,
  IconHistory,
  IconCheck,
  IconAlert,
} from "@/components/visual-icons";

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
  const visual = useVisualTheme();

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
    <div className="reports-view flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          Reportes de fallas en aulas
        </h1>
        <p className="text-sm text-muted mt-1 max-w-2xl">
          Consulta y apoya reportes de fallas físicas y técnicas en las aulas.
          Los reportes se originan desde la clase correspondiente en tu{" "}
          <Link
            href={appendVisualParams("/horario", visual)}
            className="text-blue-600 underline font-semibold"
          >
            Horario
          </Link>
          .
        </p>
      </div>

      {/* Barra de filtros */}
      <section
        aria-labelledby="filtros-heading"
        className="visual-filter-toolbar"
      >
        <h2 id="filtros-heading" className="sr-only">
          Filtros de búsqueda
        </h2>

        <label className="flex-1 min-w-[150px]">
          <span>Salón:</span>
          <input
            type="text"
            placeholder="Ej. A-12, Lab 3"
            value={filterSalon}
            onChange={(e) => setFilterSalon(e.target.value)}
          />
        </label>

        <label className="min-w-[180px]">
          <span>Tipo de falla:</span>
          <select
            value={filterTipoId}
            onChange={(e) => setFilterTipoId(e.target.value)}
          >
            <option value="">Todos los tipos</option>
            {typesResource.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-[160px]">
          <span>Estado:</span>
          <select
            value={filterEstado}
            onChange={(e) => setFilterEstado(e.target.value)}
          >
            {ESTADOS_OPCIONES.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-[160px]">
          <span>Periodo:</span>
          <input
            type="text"
            placeholder="Ej. Ago-Dic 2026"
            value={filterPeriodo}
            onChange={(e) => setFilterPeriodo(e.target.value)}
          />
        </label>

        <div className="flex items-center gap-2 pb-2 min-h-[44px]">
          <input
            id="filter-mine-check"
            type="checkbox"
            checked={filterMine}
            onChange={(e) => setFilterMine(e.target.checked)}
            className="h-4 w-4 cursor-pointer"
          />
          <label
            htmlFor="filter-mine-check"
            className="cursor-pointer font-semibold text-sm select-none"
          >
            Solo mis reportes
          </label>
        </div>

        <button
          type="button"
          onClick={() => {
            setFilterSalon("");
            setFilterTipoId("");
            setFilterEstado("");
            setFilterPeriodo("");
            setFilterMine(false);
          }}
          className="btn-secondary self-end"
        >
          <IconFilter size={16} />
          <span>Limpiar filtros</span>
        </button>
      </section>

      {/* Avisos de acción */}
      {actionSuccess && (
        <div
          role="status"
          className="notice-box notice-success"
        >
          <IconCheck size={18} className="text-green-600" />
          <span>{actionSuccess}</span>
        </div>
      )}
      {actionError && (
        <div
          role="alert"
          className="notice-box notice-error"
        >
          <IconAlert size={18} className="text-red-600" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Lista de reportes */}
      <ResourceState
        {...reportsResource}
        retry={() => {
          void reportsResource.refresh();
        }}
      >
        <div className="text-sm text-muted font-semibold">
          <p role="status">
            Mostrando {reports.length} {reports.length === 1 ? "reporte" : "reportes"}.
          </p>
        </div>

        {reports.length === 0 ? (
          <div className="visual-card p-8 text-center text-muted">
            <p className="font-semibold">
              No se encontraron reportes con los criterios seleccionados.
            </p>
            <p className="text-xs mt-2">
              Si detectas un desperfecto en tu aula, repórtalo directamente desde tu{" "}
              <Link
                href={appendVisualParams("/horario", visual)}
                className="text-blue-600 underline font-semibold"
              >
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
                <li key={report.id} className="visual-card p-5 flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--surface-border)] pb-3">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-black tracking-tight">
                          Aula {report.salon}
                        </span>
                        <span className="text-xs px-2.5 py-0.5 rounded font-bold bg-[var(--surface-secondary)] border border-[var(--surface-border)]">
                          {report.tipo_nombre}
                        </span>
                      </div>
                      <div className="text-xs text-muted mt-1">
                        <span>{report.nombre_materia}</span> ({report.clave_materia}) •{" "}
                        <span className="capitalize">{report.dia}</span> {report.hora_inicio} - {report.hora_fin} •{" "}
                        <span>{report.periodo}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`report-status report-status-${report.estado}`}>
                        {report.estado.replace("_", " ")}
                      </span>
                      {report.prioridad && (
                        <span className="text-xs px-2 py-0.5 rounded font-bold bg-purple-100 text-purple-800">
                          Prioridad: {report.prioridad}
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-main whitespace-pre-line m-0">
                    {report.descripcion}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted pt-3 border-t border-[var(--surface-border)]">
                    <div className="flex flex-wrap items-center gap-3">
                      <span>
                        Reportado: {new Date(report.creado_en).toLocaleString("es-MX")}
                      </span>
                      <span>•</span>
                      <span>
                        <strong>{report.apoyos_conteo}</strong>{" "}
                        {report.apoyos_conteo === 1 ? "alumno afectado" : "alumnos afectados"}
                      </span>
                      {report.es_mio && (
                        <span className="text-blue-700 font-bold px-2 py-0.5 rounded bg-blue-50">
                          Tu reporte
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Botón de apoyo */}
                      {report.lo_apoye ? (
                        <span className="text-green-700 font-bold flex items-center gap-1">
                          <IconCheck size={14} />
                          <span>Apoyado</span>
                        </span>
                      ) : report.es_mio ? (
                        <span className="text-muted italic">Autor</span>
                      ) : isOpen ? (
                        <button
                          type="button"
                          onClick={() => handleConfirm(report.id)}
                          disabled={isLoading}
                          aria-label={`Apoyar reporte de falla en aula ${report.salon}`}
                          className="btn-secondary text-xs"
                        >
                          <IconSupport size={14} />
                          <span>{isLoading ? "Registrando..." : "También me pasa"}</span>
                        </button>
                      ) : (
                        <span className="text-muted italic">Cerrado</span>
                      )}

                      {/* Botón retirar propio reporte si está en 'recibido' */}
                      {report.es_mio && report.estado === "recibido" && (
                        <button
                          type="button"
                          onClick={() => handleWithdraw(report.id)}
                          disabled={isLoading}
                          className="btn-secondary text-xs text-red-600 hover:text-red-800"
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
                          className="btn-secondary text-xs"
                        >
                          <IconHistory size={14} />
                          <span>
                            {isExpanded
                              ? "Ocultar historial"
                              : `Historial (${report.historial.length})`}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Panel expandible de historial */}
                  {isExpanded && report.historial && report.historial.length > 0 && (
                    <div className="mt-3 p-3 bg-[var(--surface-secondary)] border border-[var(--surface-border)] rounded text-xs flex flex-col gap-2">
                      <span className="font-bold uppercase tracking-wider text-muted">
                        Historial de seguimiento
                      </span>
                      <ol className="list-decimal list-inside space-y-1.5 p-0 m-0 text-muted">
                        {report.historial.map((ev) => (
                          <li key={ev.id}>
                            <span className="font-semibold text-main">
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
