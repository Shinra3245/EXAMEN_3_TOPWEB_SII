"use client";

import { useState } from "react";
import { useResource } from "@/hooks/use-resource";
import { ResourceState } from "@/components/resource-state";
import { matchesSubject } from "@/lib/academic-presentation";
import type { KardexDTO } from "@/types/normalizers";
import {
  IconRefresh,
  IconSearch,
  IconFilter,
} from "@/components/visual-icons";

export default function KardexPage() {
  const resource = useResource<KardexDTO>("/api/kardex");
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState("");
  const [order, setOrder] = useState("original");

  const all = resource.data?.kardex ?? [];
  const rows = all
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item }) =>
        (!period || item.periodo === period) &&
        matchesSubject(item.nombre_materia, item.clave_materia, query)
    );

  if (order === "subject") {
    rows.sort(
      (a, b) =>
        a.item.nombre_materia.localeCompare(b.item.nombre_materia, "es") ||
        a.index - b.index
    );
  }
  if (order === "period") {
    rows.sort(
      (a, b) =>
        a.item.periodo.localeCompare(b.item.periodo, "es", { numeric: true }) ||
        a.index - b.index
    );
  }

  const avanceOficial = resource.data?.porcentaje_avance;

  return (
    <div className="kardex-view flex flex-col gap-6">
      {/* Header y Acción */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Kardex
          </h1>
          <p className="text-sm text-muted mt-1 max-w-2xl">
            Calificaciones oficiales e intentos recibidos del SII, sin recalcular ni
            eliminar registros repetidos.
          </p>
        </div>
        <button
          type="button"
          disabled={resource.loading}
          onClick={() => {
            void resource.refresh();
          }}
          className="btn-secondary"
          aria-label="Actualizar kardex"
        >
          <IconRefresh size={18} />
          <span>{resource.loading ? "Actualizando..." : "Actualizar kardex"}</span>
        </button>
      </div>

      <ResourceState
        {...resource}
        retry={() => {
          void resource.refresh();
        }}
      >
        {/* Banner de Avance Académico Oficial */}
        <section
          aria-labelledby="avance-kardex-heading"
          className="visual-card p-4 flex flex-wrap items-center justify-between gap-4"
        >
          <div>
            <span
              id="avance-kardex-heading"
              className="text-xs font-bold uppercase tracking-wider text-muted block"
            >
              Avance oficial registrado
            </span>
            <span className="text-2xl font-black text-main">
              {avanceOficial === null || avanceOficial === undefined
                ? "No disponible"
                : `${avanceOficial}%`}
            </span>
          </div>

          {avanceOficial !== null && avanceOficial !== undefined && (
            <div className="w-full sm:w-64">
              <div
                className="academic-progress-track"
                role="progressbar"
                aria-valuenow={avanceOficial}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Avance oficial: ${avanceOficial}%`}
              >
                <div
                  className="academic-progress-fill"
                  style={{
                    width: `${Math.min(100, Math.max(0, avanceOficial))}%`,
                  }}
                />
              </div>
            </div>
          )}
        </section>

        {/* Panel de Filtros y Orden */}
        <section
          aria-labelledby="kardex-filters-heading"
          className="visual-filter-toolbar"
        >
          <h2 id="kardex-filters-heading" className="sr-only">
            Filtros y ordenamiento del kardex
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
              {[...new Set(all.map((r) => r.periodo))]
                .filter(Boolean)
                .map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
            </select>
          </label>

          <label className="min-w-[180px]">
            <span>Orden</span>
            <select
              aria-label="Orden"
              value={order}
              onChange={(e) => setOrder(e.target.value)}
              className="w-full"
            >
              <option value="original">Orden recibido del SII</option>
              <option value="subject">Materia (A–Z)</option>
              <option value="period">Periodo ascendente</option>
            </select>
          </label>

          <button
            type="button"
            onClick={() => {
              setQuery("");
              setPeriod("");
              setOrder("original");
            }}
            className="btn-secondary self-end"
          >
            <IconFilter size={16} />
            <span>Limpiar filtros</span>
          </button>
        </section>

        {/* Contador de registros */}
        <div className="text-sm text-muted font-semibold">
          <p role="status">
            {rows.length} de {all.length} registros mostrados.
          </p>
        </div>

        {/* Tabla o Estado Vacío */}
        {!rows.length ? (
          <div className="visual-card p-8 text-center text-muted">
            <p className="font-semibold">
              {all.length
                ? "No hay registros que coincidan con los filtros."
                : "El SII no devolvió registros de kardex."}
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <caption>Historial académico completo recibido del SII</caption>
              <thead>
                <tr>
                  {[
                    "Periodo",
                    "Materia",
                    "Semestre",
                    "Créditos",
                    "Calificación oficial",
                    "Observación",
                  ].map((label) => (
                    <th scope="col" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ item, index }) => (
                  <tr key={index}>
                    <td className="text-xs text-muted whitespace-nowrap">
                      {item.periodo || "No disponible"}
                    </td>
                    <th scope="row">
                      <span className="font-bold block">
                        {item.nombre_materia}
                      </span>
                      <small className="text-xs text-muted block font-mono">
                        {item.clave_materia}
                      </small>
                    </th>
                    <td className="text-center font-semibold">
                      {item.semestre ?? "N/D"}
                    </td>
                    <td className="text-center font-semibold">
                      {item.creditos || "N/D"}
                    </td>
                    <td className="font-extrabold text-base">
                      {item.calificacion?.trim()
                        ? item.calificacion
                        : "No disponible"}
                    </td>
                    <td className="text-xs text-muted">
                      {item.descripcion || "Sin observación"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ResourceState>
    </div>
  );
}
