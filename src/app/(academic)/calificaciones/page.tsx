"use client";
import { useState } from "react";
import { useResource } from "@/hooks/use-resource";
import { ResourceState } from "@/components/resource-state";
import {
  gradeLevel,
  matchesSubject,
  periodLabel,
} from "@/lib/academic-presentation";
import type { GradesPeriodDTO } from "@/types/normalizers";
const reasons = {
  parciales_incompletos: "Faltan parciales",
  numeracion_invalida: "Numeración de parciales no compatible",
  evaluaciones_duplicadas: "Hay parciales duplicados",
  calificaciones_invalidas: "Hay calificaciones no compatibles con el cálculo",
};
export default function GradesPage() {
  const resource = useResource<GradesPeriodDTO[]>("/api/grades");
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState("");
  const rows = (resource.data ?? [])
    .flatMap((group, i) =>
      group.materias.map((subject, j) => ({
        subject,
        period: group.periodo,
        periodKey: String(i),
        key: `${i}-${j}`,
      })),
    )
    .filter(
      (row) =>
        (!period || row.periodKey === period) &&
        matchesSubject(
          row.subject.nombre_materia,
          row.subject.clave_materia,
          query,
        ),
    );
  return (
    <>
      <h1>Calificaciones</h1>
      <p>
        La final calculada es el promedio de cuatro parciales válidos,
        redondeado a entero. No sustituye la calificación oficial del kardex.
      </p>
      <button
        type="button"
        disabled={resource.loading}
        onClick={() => {
          void resource.refresh();
        }}
      >
        Actualizar calificaciones
      </button>
      <ResourceState
        {...resource}
        retry={() => {
          void resource.refresh();
        }}
      >
        <div className="controls">
          <label>
            Buscar materia
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label>
            Periodo
            <select
              aria-label="Periodo"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              <option value="">Todos los periodos</option>
              {resource.data?.map((group, i) => (
                <option key={i} value={i}>
                  {periodLabel(group.periodo)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setPeriod("");
            }}
          >
            Limpiar filtros
          </button>
        </div>
        <p>
          Semáforo del equipo: verde 90–100; amarillo 70–89; rojo menor de 70;
          pendiente sin color de rendimiento.
        </p>
        <p role="status">{rows.length} materias mostradas.</p>
        {!rows.length ? (
          <p>
            {resource.data?.some((g) => g.materias.length)
              ? "No hay materias que coincidan con los filtros."
              : "El SII no devolvió calificaciones."}
          </p>
        ) : (
          <div className="table-scroll">
            <table>
              <caption>Calificaciones por materia y periodo</caption>
              <thead>
                <tr>
                  <th scope="col">Materia</th>
                  <th scope="col">Periodo</th>
                  {[1, 2, 3, 4].map((n) => (
                    <th key={n} scope="col">
                      Parcial {n}
                    </th>
                  ))}
                  <th scope="col">Final calculada</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ subject, period, key }) => {
                  const state = gradeLevel(subject.resultadoFinal);
                  return (
                    <tr key={key}>
                      <th scope="row">
                        {subject.nombre_materia}
                        <br />
                        <small>{subject.clave_materia}</small>
                      </th>
                      <td>{periodLabel(period)}</td>
                      {[1, 2, 3, 4].map((n) => {
                        const values = subject.evaluaciones.filter(
                          (e) => e.numero_calificacion === n,
                        );
                        return (
                          <td key={n}>
                            {values.length
                              ? values
                                  .map((e) =>
                                    e.calificacion?.trim()
                                      ? e.calificacion
                                      : "Pendiente",
                                  )
                                  .join(" / ")
                              : "Pendiente"}
                          </td>
                        );
                      })}
                      <td>{subject.resultadoFinal ?? "Pendiente"}</td>
                      <td>
                        <span data-grade-level={state.level}>
                          {state.label}
                        </span>
                        {subject.motivoFinal && (
                          <>
                            <br />
                            {reasons[subject.motivoFinal]}
                          </>
                        )}
                        {subject.evaluaciones.some(
                          (e) =>
                            ![1, 2, 3, 4].includes(e.numero_calificacion ?? -1),
                        ) && (
                          <details>
                            <summary>
                              Evaluaciones adicionales recibidas
                            </summary>
                            <ul>
                              {subject.evaluaciones
                                .filter(
                                  (e) =>
                                    ![1, 2, 3, 4].includes(
                                      e.numero_calificacion ?? -1,
                                    ),
                                )
                                .map((e, i) => (
                                  <li key={i}>
                                    Evaluación{" "}
                                    {e.numero_calificacion ?? "sin número"}:{" "}
                                    {e.calificacion?.trim()
                                      ? e.calificacion
                                      : "Pendiente"}
                                  </li>
                                ))}
                            </ul>
                          </details>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ResourceState>
    </>
  );
}
