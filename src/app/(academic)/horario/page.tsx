"use client";

import { useState } from "react";
import Link from "next/link";
import { useResource } from "@/hooks/use-resource";
import { ResourceState } from "@/components/resource-state";
import { Modal } from "@/components/modal";
import { useVisualTheme, appendVisualParams } from "@/components/visual-theme";
import { dayLabels, periodLabel } from "@/lib/academic-presentation";
import { apiRequest, ApiClientError } from "@/lib/api-client";
import type {
  DiaSemana,
  SchedulePeriodDTO,
  ScheduleItemDTO,
  SesionHorarioDTO,
  PeriodoDTO,
} from "@/types/normalizers";
import type { FaultTypeDTO } from "@/types/api";
import {
  IconRefresh,
  IconFilter,
  IconReportes,
  IconCheck,
  IconAlert,
} from "@/components/visual-icons";

const days = Object.keys(dayLabels) as DiaSemana[];

interface ActiveSessionReport {
  subject: ScheduleItemDTO;
  session: SesionHorarioDTO;
  period: PeriodoDTO | null;
}

export default function SchedulePage() {
  const resource = useResource<SchedulePeriodDTO[]>("/api/schedule");
  const typesResource = useResource<FaultTypeDTO[]>("/api/report-types");
  const visual = useVisualTheme();
  const [period, setPeriod] = useState("");
  const [day, setDay] = useState("");

  // Estado del modal accesible para reportar falla
  const [activeSession, setActiveSession] =
    useState<ActiveSessionReport | null>(null);
  const [selectedTipoId, setSelectedTipoId] = useState<number | "">("");
  const [descripcion, setDescripcion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSuccess, setReportSuccess] = useState<string | null>(null);

  const closeModal = () => {
    setActiveSession(null);
    setReportError(null);
    setReportSuccess(null);
    setDescripcion("");
    setSubmitting(false);
  };

  const openReportModal = (
    subject: ScheduleItemDTO,
    session: SesionHorarioDTO,
    groupPeriod: PeriodoDTO | null
  ) => {
    setActiveSession({ subject, session, period: groupPeriod });
    setReportError(null);
    setReportSuccess(null);
    setDescripcion("");
    if (typesResource.data && typesResource.data.length > 0) {
      setSelectedTipoId(typesResource.data[0].id);
    } else {
      setSelectedTipoId("");
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession) return;
    if (!selectedTipoId) {
      setReportError("Por favor selecciona un tipo de falla");
      return;
    }
    const trimmedDesc = descripcion.trim();
    if (!trimmedDesc) {
      setReportError("Por favor ingresa una breve descripción de la falla");
      return;
    }
    if (trimmedDesc.length > 500) {
      setReportError("La descripción no debe exceder 500 caracteres");
      return;
    }

    setSubmitting(true);
    setReportError(null);
    try {
      await apiRequest<{ id: string; message: string }>("/api/reports/create", {
        method: "POST",
        body: JSON.stringify({
          clave_materia: activeSession.subject.clave_materia,
          dia: activeSession.session.dia,
          hora_inicio: activeSession.session.inicio,
          hora_fin: activeSession.session.fin,
          tipo_id: Number(selectedTipoId),
          descripcion: trimmedDesc,
          salon: activeSession.session.salon || undefined,
          periodo:
            activeSession.period?.descripcion_periodo ||
            activeSession.period?.clave_periodo ||
            undefined,
          clave_periodo: activeSession.period?.clave_periodo || undefined,
        }),
      });
      setReportSuccess("Reporte registrado exitosamente.");
    } catch (err: unknown) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Fallo al enviar el reporte";
      setReportError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const groups = (resource.data ?? [])
    .map((group, index) => ({ group, index }))
    .filter(({ index }) => !period || period === String(index));

  const sessions = groups.flatMap(({ group, index }) =>
    group.horario.flatMap((subject, subjectIndex) =>
      subject.sesiones
        .filter((s) => !day || s.dia === day)
        .map((session, sessionIndex) => ({
          subject,
          session,
          period: group.periodo,
          key: `${index}-${subjectIndex}-${sessionIndex}`,
        }))
    )
  );

  const unparsed = groups.flatMap(({ group, index }) =>
    group.horario.flatMap((subject, subjectIndex) =>
      subject.diasNoInterpretados
        .filter((d) => !day || day === d)
        .map((d) => ({
          subject,
          day: d,
          key: `${index}-${subjectIndex}-${d}`,
          period: group.periodo,
        }))
    )
  );

  return (
    <div className="schedule-view flex flex-col gap-6">
      {/* Header y Acción */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Horario
          </h1>
          <p className="text-sm text-muted mt-1 max-w-2xl">
            Lista por día y hora. Aulas y franjas se muestran únicamente cuando el
            SII las proporciona.
          </p>
        </div>
        <button
          type="button"
          disabled={resource.loading}
          onClick={() => {
            void resource.refresh();
          }}
          className="btn-secondary"
          aria-label="Actualizar horario"
        >
          <IconRefresh size={18} />
          <span>{resource.loading ? "Actualizando..." : "Actualizar horario"}</span>
        </button>
      </div>

      <ResourceState
        {...resource}
        retry={() => {
          void resource.refresh();
        }}
      >
        {/* Panel de Filtros */}
        <section
          aria-labelledby="schedule-filters-heading"
          className="visual-filter-toolbar"
        >
          <h2 id="schedule-filters-heading" className="sr-only">
            Filtros del horario
          </h2>

          <label className="min-w-[180px]">
            <span>Periodo</span>
            <select
              aria-label="Periodo"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-full"
            >
              <option value="">Todos los periodos</option>
              {resource.data?.map((g, i) => (
                <option key={i} value={i}>
                  {periodLabel(g.periodo)}
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-[180px]">
            <span>Día de la semana</span>
            <select
              aria-label="Día"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="w-full"
            >
              <option value="">Todos los días</option>
              {days.map((d) => (
                <option key={d} value={d}>
                  {dayLabels[d]}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => {
              setPeriod("");
              setDay("");
            }}
            className="btn-secondary self-end"
          >
            <IconFilter size={16} />
            <span>Limpiar filtros</span>
          </button>
        </section>

        {/* Status de conteo */}
        <div className="text-sm text-muted font-semibold">
          <p role="status">
            {sessions.length} sesiones mostradas; {unparsed.length} franjas sin
            interpretar.
          </p>
        </div>

        {/* Sin resultados */}
        {!sessions.length && !unparsed.length && (
          <div className="visual-card p-8 text-center text-muted">
            <p className="font-semibold">
              {resource.data?.some((g) => g.horario.length)
                ? "No hay clases para los filtros seleccionados."
                : "El SII no devolvió materias en el horario."}
            </p>
          </div>
        )}

        {/* Bloque por día */}
        {days
          .filter((d) => !day || day === d)
          .map((d) => {
            const rows = sessions
              .filter((row) => row.session.dia === d)
              .sort((a, b) => a.session.inicio.localeCompare(b.session.inicio));
            const raw = unparsed.filter((row) => row.day === d);

            if (!rows.length && !raw.length) return null;

            return (
              <section
                key={d}
                aria-labelledby={`day-${d}`}
                className="flex flex-col gap-3"
              >
                <h2
                  id={`day-${d}`}
                  className="text-xl font-extrabold tracking-tight text-main border-b border-[var(--surface-border)] pb-2"
                >
                  {dayLabels[d]}
                </h2>

                {rows.length > 0 && (
                  <div className="table-scroll">
                    <table>
                      <caption>
                        Clases programadas para el {dayLabels[d].toLocaleLowerCase("es")}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Horario</th>
                          <th scope="col">Materia</th>
                          <th scope="col">Salón / Aula</th>
                          <th scope="col">Periodo</th>
                          <th scope="col">Reporte de aula</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(({ subject, session, period, key }) => (
                          <tr key={key}>
                            <td className="whitespace-nowrap font-mono font-bold text-sm">
                              {session.inicio} – {session.fin}
                            </td>
                            <th scope="row">
                              <span className="font-bold block">
                                {subject.nombre_materia}
                              </span>
                              <small className="text-xs text-muted block font-mono">
                                {subject.clave_materia}
                              </small>
                            </th>
                            <td className="font-semibold">
                              {session.salon ? (
                                <span className="inline-block px-2 py-0.5 rounded font-mono text-sm bg-[var(--surface-secondary)] border border-[var(--surface-border)]">
                                  {session.salon}
                                </span>
                              ) : (
                                <span className="text-muted text-xs">No disponible</span>
                              )}
                            </td>
                            <td className="text-xs text-muted whitespace-nowrap">
                              {periodLabel(period)}
                            </td>
                            <td>
                              {session.salon ? (
                                <button
                                  type="button"
                                  className="btn-secondary text-xs"
                                  onClick={() =>
                                    openReportModal(subject, session, period)
                                  }
                                  aria-label={`Reportar falla en aula ${session.salon} de ${subject.nombre_materia}`}
                                >
                                  <IconReportes size={14} />
                                  <span>Reportar falla</span>
                                </button>
                              ) : (
                                <span className="text-muted text-xs">
                                  Sin aula
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {raw.map(({ subject, key, period }) => (
                  <div
                    key={key}
                    className="visual-card p-3 text-xs bg-[var(--pastel-yellow-bg)] border-[var(--pastel-yellow-border)] text-[var(--pastel-yellow-text)]"
                  >
                    <strong>Franja sin interpretar:</strong> {subject.nombre_materia} (
                    {periodLabel(period)}): {subject[d] || "Sin horario legible"}.
                    Se conserva el texto institucional oficial.
                  </div>
                ))}
              </section>
            );
          })}
      </ResourceState>

      {/* Modal accesible para registrar reporte */}
      {activeSession && (
        <Modal
          titleId="report-modal-title"
          onDismiss={closeModal}
          dismissible={!submitting}
        >
          <div className="modal-dialog-panel">
            <h2 id="report-modal-title" className="modal-title">
              <IconReportes size={22} />
              <span>Reportar falla en aula</span>
            </h2>

            <div className="p-3 bg-[var(--surface-secondary)] border border-[var(--surface-border)] rounded text-xs flex flex-col gap-1">
              <p>
                <strong>Salón:</strong> {activeSession.session.salon}
              </p>
              <p>
                <strong>Materia:</strong> {activeSession.subject.nombre_materia} (
                {activeSession.subject.clave_materia})
              </p>
              <p>
                <strong>Horario:</strong> {dayLabels[activeSession.session.dia]}{" "}
                {activeSession.session.inicio} - {activeSession.session.fin}
              </p>
              <p>
                <strong>Periodo:</strong> {periodLabel(activeSession.period)}
              </p>
            </div>

            {reportSuccess ? (
              <div role="status" className="flex flex-col gap-4">
                <div className="p-3 bg-green-50 border border-green-200 text-green-800 rounded font-semibold text-sm flex items-center gap-2">
                  <IconCheck size={18} className="text-green-600" />
                  <span>{reportSuccess}</span>
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  <Link
                    href={appendVisualParams("/reportes", visual)}
                    className="btn-primary"
                  >
                    Ver en módulo de Reportes
                  </Link>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="btn-secondary"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmitReport} className="flex flex-col gap-4">
                {reportError && (
                  <div
                    role="alert"
                    className="p-3 bg-red-50 border border-red-200 text-red-800 rounded font-semibold text-sm flex items-center gap-2"
                  >
                    <IconAlert size={18} className="text-red-600" />
                    <span>{reportError}</span>
                  </div>
                )}

                <div>
                  <label htmlFor="fault-type-select">
                    Tipo de falla observada:
                  </label>
                  <select
                    id="fault-type-select"
                    value={selectedTipoId}
                    onChange={(e) =>
                      setSelectedTipoId(
                        e.target.value ? Number(e.target.value) : ""
                      )
                    }
                    className="w-full mt-1"
                    required
                  >
                    <option value="">-- Selecciona el tipo de falla --</option>
                    {typesResource.data?.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="fault-description">
                    Descripción del desperfecto (máx. 500 caracteres):
                  </label>
                  <textarea
                    id="fault-description"
                    rows={4}
                    value={descripcion}
                    maxLength={500}
                    onChange={(e) => setDescripcion(e.target.value)}
                    placeholder="Describe claramente la falla observada en el aula..."
                    className="w-full mt-1"
                    required
                  />
                  <small className="text-xs text-muted block mt-1">
                    {descripcion.length} / 500 caracteres
                  </small>
                </div>

                <div className="flex justify-end gap-3 mt-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={submitting}
                    className="btn-secondary"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={
                      submitting || !selectedTipoId || !descripcion.trim()
                    }
                    className="btn-primary"
                  >
                    {submitting ? "Enviando..." : "Enviar reporte"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
