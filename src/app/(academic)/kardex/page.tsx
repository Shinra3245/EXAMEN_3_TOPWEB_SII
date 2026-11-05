"use client";
import { useState } from "react";
import { useResource } from "@/hooks/use-resource";
import { ResourceState } from "@/components/resource-state";
import { matchesSubject } from "@/lib/academic-presentation";
import type { KardexDTO } from "@/types/normalizers";
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
        matchesSubject(item.nombre_materia, item.clave_materia, query),
    );
  if (order === "subject")
    rows.sort(
      (a, b) =>
        a.item.nombre_materia.localeCompare(b.item.nombre_materia, "es") ||
        a.index - b.index,
    );
  if (order === "period")
    rows.sort(
      (a, b) =>
        a.item.periodo.localeCompare(b.item.periodo, "es", { numeric: true }) ||
        a.index - b.index,
    );
  return (
    <>
      <h1>Kardex</h1>
      <p>
        Calificaciones oficiales e intentos recibidos del SII, sin recalcular ni
        eliminar registros repetidos.
      </p>
      <button
        type="button"
        disabled={resource.loading}
        onClick={() => {
          void resource.refresh();
        }}
      >
        Actualizar kardex
      </button>
      <ResourceState
        {...resource}
        retry={() => {
          void resource.refresh();
        }}
      >
        <p>
          Avance oficial:{" "}
          {resource.data?.porcentaje_avance === null
            ? "No disponible"
            : `${resource.data?.porcentaje_avance ?? "No disponible"}%`}
        </p>
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
              {[...new Set(all.map((r) => r.periodo))]
                .filter(Boolean)
                .map((p) => (
                  <option key={p}>{p}</option>
                ))}
            </select>
          </label>
          <label>
            Orden
            <select
              aria-label="Orden"
              value={order}
              onChange={(e) => setOrder(e.target.value)}
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
          >
            Limpiar filtros
          </button>
        </div>
        <p role="status">
          {rows.length} de {all.length} registros mostrados.
        </p>
        {!rows.length ? (
          <p>
            {all.length
              ? "No hay registros que coincidan con los filtros."
              : "El SII no devolvió registros de kardex."}
          </p>
        ) : (
          <div className="table-scroll">
            <table>
              <caption>Historial académico recibido</caption>
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
                    <td>{item.periodo || "No disponible"}</td>
                    <th scope="row">
                      {item.nombre_materia}
                      <br />
                      <small>{item.clave_materia}</small>
                    </th>
                    <td>{item.semestre ?? "No disponible"}</td>
                    <td>{item.creditos || "No disponible"}</td>
                    <td>
                      {item.calificacion?.trim()
                        ? item.calificacion
                        : "No disponible"}
                    </td>
                    <td>{item.descripcion || "Sin observación"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ResourceState>
    </>
  );
}
