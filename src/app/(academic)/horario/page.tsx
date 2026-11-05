"use client";
import { useState } from "react";
import Link from "next/link";
import { useResource } from "@/hooks/use-resource";
import { ResourceState } from "@/components/resource-state";
import { Modal } from "@/components/modal";
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

const days = Object.keys(dayLabels) as DiaSemana[];

interface ActiveSessionReport {
  subject: ScheduleItemDTO;
  session: SesionHorarioDTO;
  period: PeriodoDTO | null;
}

export default function SchedulePage() {
  const resource = useResource<SchedulePeriodDTO[]>("/api/schedule");
  const typesResource = useResource<FaultTypeDTO[]>("/api/report-types");
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
    <>
      <h1>Horario</h1>
      <p>
        Lista por día y hora. Aulas y franjas se muestran únicamente cuando el
        SII las proporciona.
      </p>
      <button
        type="button"
        disabled={resource.loading}
        onClick={() => {
          void resource.refresh();
        }}
      >
        Actualizar horario
      </button>
      <ResourceState
        {...resource}
        retry={() => {
          void resource.refresh();
        }}
      >
        <div className="controls">
          <label>
            Periodo
            <select
              aria-label="Periodo"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              <option value="">Todos los periodos</option>
              {resource.data?.map((g, i) => (
                <option key={i} value={i}>
                  {periodLabel(g.periodo)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Día
            <select
              aria-label="Día"
              value={day}
              onChange={(e) => setDay(e.target.value)}
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
          >
            Limpiar filtros
          </button>
        </div>
        <p role="status">
          {sessions.length} sesiones mostradas; {unparsed.length} franjas sin
          interpretar.
        </p>
        {!sessions.length && !unparsed.length && (
          <p>
            {resource.data?.some((g) => g.horario.length)
              ? "No hay clases para los filtros seleccionados."
              : "El SII no devolvió materias en el horario."}
          </p>
        )}
        {days
          .filter((d) => !day || day === d)
          .map((d) => {
            const rows = sessions
              .filter((row) => row.session.dia === d)
              .sort((a, b) => a.session.inicio.localeCompare(b.session.inicio));
            const raw = unparsed.filter((row) => row.day === d);
            return !rows.length && !raw.length ? null : (
              <section key={d} aria-labelledby={`day-${d}`}>
                <h2 id={`day-${d}`}>{dayLabels[d]}</h2>
                {rows.length > 0 && (
                  <div className="table-scroll">
                    <table>
                      <caption>
                        Clases del {dayLabels[d].toLocaleLowerCase("es")}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Inicio</th>
                          <th scope="col">Fin</th>
                          <th scope="col">Materia</th>
                          <th scope="col">Salón</th>
                          <th scope="col">Periodo</th>
                          <th scope="col">Reporte</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(({ subject, session, period, key }) => (
                          <tr key={key}>
                            <td>{session.inicio}</td>
                            <td>{session.fin}</td>
                            <th scope="row">
                              {subject.nombre_materia}
                              <br />
                              <small>{subject.clave_materia}</small>
                            </th>
                            <td>{session.salon || "No disponible"}</td>
                            <td>{periodLabel(period)}</td>
                            <td>
                              {session.salon ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openReportModal(subject, session, period)
                                  }
                                  aria-label={`Reportar falla en aula ${session.salon} de ${subject.nombre_materia}`}
                                >
                                  Reportar falla
                                </button>
                              ) : (
                                <span className="text-gray-400">Sin aula</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {raw.map(({ subject, key, period }) => (
                  <p key={key} className="notice">
                    Franja sin interpretar: {subject.nombre_materia} (
                    {periodLabel(period)}):{" "}
                    {subject[d] || "Sin horario legible"}. Se conserva el texto
                    institucional.
                  </p>
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
          <div className="w-full max-w-lg rounded border border-gray-300 bg-white p-6 shadow-lg max-h-[90vh] overflow-y-auto">
            <h2 id="report-modal-title" className="text-xl font-bold mb-3">
              Reportar falla en aula
            </h2>

            <div className="mb-4 rounded bg-gray-50 p-3 border border-gray-200 text-sm">
              <p>
                <strong>Salón:</strong> {activeSession.session.salon}
              </p>
              <p>
                <strong>Materia:</strong>{" "}
                {activeSession.subject.nombre_materia} (
                {activeSession.subject.clave_materia})
              </p>
              <p>
                <strong>Horario:</strong>{" "}
                {dayLabels[activeSession.session.dia]}{" "}
                {activeSession.session.inicio} - {activeSession.session.fin}
              </p>
              <p>
                <strong>Periodo:</strong>{" "}
                {periodLabel(activeSession.period)}
              </p>
            </div>

            {reportSuccess ? (
              <div role="status" className="mb-4">
                <p className="text-green-800 font-semibold mb-3">
                  {reportSuccess}
                </p>
                <div className="flex gap-2">
                  <Link
                    href="/reportes"
                    className="inline-block px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700"
                  >
                    Ver en módulo de Reportes
                  </Link>
                  <button type="button" onClick={closeModal}>
                    Cerrar
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmitReport} className="flex flex-col gap-4">
                {reportError && (
                  <p role="alert" className="text-red-700 font-semibold">
                    {reportError}
                  </p>
                )}

                <div>
                  <label
                    htmlFor="fault-type-select"
                    className="block font-semibold mb-1"
                  >
                    Tipo de falla:
                  </label>
                  <select
                    id="fault-type-select"
                    value={selectedTipoId}
                    onChange={(e) =>
                      setSelectedTipoId(
                        e.target.value ? Number(e.target.value) : ""
                      )
                    }
                    className="w-full"
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
                  <label
                    htmlFor="fault-description"
                    className="block font-semibold mb-1"
                  >
                    Descripción de la falla (máx. 500 caracteres):
                  </label>
                  <textarea
                    id="fault-description"
                    rows={4}
                    value={descripcion}
                    maxLength={500}
                    onChange={(e) => setDescripcion(e.target.value)}
                    placeholder="Describe claramente la falla observada en el aula..."
                    className="w-full"
                    required
                  />
                  <small className="text-gray-600">
                    {descripcion.length} / 500 caracteres
                  </small>
                </div>

                <div className="flex justify-end gap-2 mt-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={submitting}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !selectedTipoId || !descripcion.trim()}
                  >
                    {submitting ? "Enviando..." : "Enviar reporte"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
