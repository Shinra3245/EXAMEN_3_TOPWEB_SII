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
import {
  IconRefresh,
  IconSearch,
  IconFilter,
} from "@/components/visual-icons";

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
      }))
    )
    .filter(
      (row) =>
        (!period || row.periodKey === period) &&
        matchesSubject(
          row.subject.nombre_materia,
          row.subject.clave_materia,
          query
        )
    );

  return (
    <div className="grades-view flex flex-col gap-6">
      {/* Header y Acción */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Calificaciones
          </h1>
          <p className="text-sm text-muted mt-1 max-w-2xl">
            La final calculada es el promedio de cuatro parciales válidos,
            redondeado a entero. No sustituye la calificación oficial del kardex.
          </p>
        </div>
        <button
          type="button"
          disabled={resource.loading}
          onClick={() => {
            void resource.refresh();
          }}
          className="btn-secondary"
          aria-label="Actualizar calificaciones"
        >
          <IconRefresh size={18} />
          <span>{resource.loading ? "Actualizando..." : "Actualizar calificaciones"}</span>
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
          aria-labelledby="filters-heading"
          className="visual-filter-toolbar"
        >
          <h2 id="filters-heading" className="sr-only">
            Filtros de calificaciones
          </h2>

          <label className="flex-1 min-w-[200px]">
            <span>Buscar materia</span>
            <div className="relative flex items-center">
              <input
                type="search"
                placeholder="Nombre o clave..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pr-8"
              />
              <span className="absolute right-2.5 text-muted pointer-events-none">
                <IconSearch size={16} />
              </span>
            </div>
          </label>

          <label className="min-w-[180px]">
            <span>Periodo</span>
            <select
              aria-label="Periodo"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-full"
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
            className="btn-secondary self-end"
          >
            <IconFilter size={16} />
            <span>Limpiar filtros</span>
          </button>
        </section>

        {/* Leyenda y Semáforo del Equipo */}
        <div className="visual-card p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-main">Semáforo del equipo:</span>
            <span data-grade-level="excelente">Excelente (90–100)</span>
            <span data-grade-level="aprobado">Aprobado (70–89)</span>
            <span data-grade-level="reprobado">Reprobado (&lt; 70)</span>
            <span data-grade-level="pendiente">Pendiente (sin nota)</span>
          </div>
          <p role="status" className="font-semibold text-muted m-0">
            {rows.length} {rows.length === 1 ? "materia mostrada" : "materias mostradas"}.
          </p>
        </div>

        {/* Tabla de Calificaciones o Estado Vacío */}
        {!rows.length ? (
          <div className="visual-card p-8 text-center text-muted">
            <p className="font-semibold">
              {resource.data?.some((g) => g.materias.length)
                ? "No hay materias que coincidan con los filtros."
                : "El SII no devolvió calificaciones para este periodo."}
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <caption>Calificaciones por materia y periodo oficial</caption>
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
                        <span className="font-bold block">
                          {subject.nombre_materia}
                        </span>
                        <small className="text-xs text-muted block font-mono">
                          {subject.clave_materia}
                        </small>
                      </th>
                      <td className="text-xs text-muted whitespace-nowrap">
                        {periodLabel(period)}
                      </td>
                      {[1, 2, 3, 4].map((n) => {
                        const values = subject.evaluaciones.filter(
                          (e) => e.numero_calificacion === n
                        );
                        return (
                          <td key={n} className="font-semibold">
                            {values.length
                              ? values
                                  .map((e) =>
                                    e.calificacion?.trim()
                                      ? e.calificacion
                                      : "Pendiente"
                                  )
                                  .join(" / ")
                              : "Pendiente"}
                          </td>
                        );
                      })}
                      <td className="font-extrabold text-base">
                        {subject.resultadoFinal ?? "Pendiente"}
                      </td>
                      <td>
                        <span data-grade-level={state.level}>
                          {state.label}
                        </span>
                        {subject.motivoFinal && (
                          <div className="text-xs text-muted mt-1">
                            {reasons[subject.motivoFinal]}
                          </div>
                        )}
                        {subject.evaluaciones.some(
                          (e) =>
                            ![1, 2, 3, 4].includes(e.numero_calificacion ?? -1)
                        ) && (
                          <details className="mt-1 text-xs">
                            <summary className="cursor-pointer text-blue-600 font-semibold">
                              Evaluaciones adicionales recibidas
                            </summary>
                            <ul className="list-disc list-inside mt-1 space-y-0.5">
                              {subject.evaluaciones
                                .filter(
                                  (e) =>
                                    ![1, 2, 3, 4].includes(
                                      e.numero_calificacion ?? -1
                                    )
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
    </div>
  );
}
