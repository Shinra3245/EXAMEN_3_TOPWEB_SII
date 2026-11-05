"use client";
import { useState } from "react";
import { useResource } from "@/hooks/use-resource";
import { ResourceState } from "@/components/resource-state";
import { dayLabels, periodLabel } from "@/lib/academic-presentation";
import type { DiaSemana, SchedulePeriodDTO } from "@/types/normalizers";
const days = Object.keys(dayLabels) as DiaSemana[];
export default function SchedulePage() {
  const resource = useResource<SchedulePeriodDTO[]>("/api/schedule");
  const [period, setPeriod] = useState("");
  const [day, setDay] = useState("");
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
        })),
    ),
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
        })),
    ),
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
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
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
            <select value={day} onChange={(e) => setDay(e.target.value)}>
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
    </>
  );
}
