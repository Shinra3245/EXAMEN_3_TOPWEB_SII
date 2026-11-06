"use client";

import { useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useResource } from "@/hooks/use-resource";
import { ResourceState } from "@/components/resource-state";
import { apiRequest, ApiClientError } from "@/lib/api-client";
import type { FaultTypeDTO } from "@/types/api";

export default function AdminTiposPage() {
  const { esAdmin, status } = useAuth();
  const typesResource = useResource<FaultTypeDTO[]>("/api/admin/report-types");

  const [nuevoNombre, setNuevoNombre] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

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

  const handleCreateType = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nuevoNombre.trim();
    if (!trimmed) {
      setErrorMsg("El nombre del tipo de falla es obligatorio.");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await apiRequest<{ message: string }>("/api/admin/report-types/save", {
        method: "POST",
        body: JSON.stringify({
          nombre: trimmed,
          ...(editingId === null ? { activo: true } : { id: editingId }),
        }),
      });
      setSuccessMsg(editingId === null
        ? "Tipo de falla agregado correctamente."
        : "Nombre del tipo de falla actualizado correctamente.");
      setNuevoNombre("");
      setEditingId(null);
      void typesResource.refresh();
    } catch (err: unknown) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Fallo al agregar tipo de falla";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActivo = async (type: FaultTypeDTO) => {
    setTogglingId(type.id);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await apiRequest<{ message: string }>("/api/admin/report-types/save", {
        method: "POST",
        body: JSON.stringify({
          id: type.id,
          nombre: type.nombre,
          activo: !type.activo,
        }),
      });
      setSuccessMsg(`Tipo "${type.nombre}" actualizado.`);
      void typesResource.refresh();
    } catch (err: unknown) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Fallo al actualizar el tipo de falla";
      setErrorMsg(msg);
    } finally {
      setTogglingId(null);
    }
  };

  const types = typesResource.data ?? [];

  return (
    <div className="admin-types-page">
      <header className="report-page-header mb-6">
        <h1 className="text-2xl font-bold">Catálogo de tipos de falla</h1>
        <p className="text-gray-600 mt-1">
          Configuración administrativa del catálogo de opciones disponibles al
          reportar averías en aulas.
        </p>
      </header>

      {successMsg && (
        <p
          role="status"
          className="feedback feedback-success mb-4 p-3 bg-green-50 text-green-800 border border-green-200 rounded"
        >
          {successMsg}
        </p>
      )}
      {errorMsg && (
        <p
          role="alert"
          className="feedback feedback-error mb-4 p-3 bg-red-50 text-red-800 border border-red-200 rounded"
        >
          {errorMsg}
        </p>
      )}

      {/* Formulario para añadir nuevo tipo */}
      <section
        aria-labelledby="nuevo-tipo-heading"
        className="admin-type-form controls mb-8"
      >
        <h2 id="nuevo-tipo-heading" className="text-base font-bold mb-3">
          {editingId === null ? "Agregar nuevo tipo de falla" : "Editar tipo de falla"}
        </h2>
        <form onSubmit={handleCreateType} className="flex flex-wrap gap-3 items-end">
          <label className="flex flex-col text-sm font-medium flex-1 min-w-[240px]">
            Nombre del tipo:
            <input
              ref={nameInput}
              type="text"
              placeholder="Ej. Cortinas / Persianas, Iluminación"
              value={nuevoNombre}
              disabled={submitting}
              maxLength={100}
              onChange={(e) => setNuevoNombre(e.target.value)}
              className="mt-1"
              required
            />
          </label>
          <button type="submit" disabled={submitting || !nuevoNombre.trim()}>
            {submitting ? "Guardando..." : editingId === null ? "Agregar al catálogo" : "Guardar nombre"}
          </button>
          {editingId !== null && (
            <button type="button" disabled={submitting} onClick={() => {
              setEditingId(null);
              setNuevoNombre("");
              setErrorMsg(null);
            }}>
              Cancelar edición
            </button>
          )}
        </form>
      </section>

      {/* Tabla del catálogo */}
      <ResourceState
        {...typesResource}
        retry={() => {
          void typesResource.refresh();
        }}
      >
        <section className="admin-types-table" aria-labelledby="catalogo-heading">
          <h2 id="catalogo-heading" className="text-lg font-bold mb-3">
            Tipos registrados ({types.length})
          </h2>

          <div className="table-scroll">
            <table>
              <caption>Catálogo completo de fallas con estado activo/inactivo</caption>
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Nombre</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Fecha registro</th>
                  <th scope="col">Acción</th>
                </tr>
              </thead>
              <tbody>
                {types.map((type) => {
                  const isToggling = togglingId === type.id;
                  return (
                    <tr key={type.id}>
                      <td>{type.id}</td>
                      <td>
                        <strong>{type.nombre}</strong>
                      </td>
                      <td>
                        <span
                          className={`type-status ${
                            type.activo ? "is-active" : "is-inactive"
                          } inline-block px-2 py-0.5 text-xs font-semibold rounded ${
                            type.activo
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-200 text-gray-700"
                          }`}
                        >
                          {type.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td>
                        <small>
                          {type.creado_en
                            ? new Date(type.creado_en).toLocaleDateString("es-MX")
                            : "-"}
                        </small>
                      </td>
                      <td>
                        <button
                          type="button"
                          disabled={submitting || togglingId !== null}
                          aria-label={`Editar tipo ${type.nombre}`}
                          onClick={() => {
                            setEditingId(type.id);
                            setNuevoNombre(type.nombre);
                            setErrorMsg(null);
                            setSuccessMsg(null);
                            nameInput.current?.focus();
                          }}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActivo(type)}
                          disabled={togglingId !== null || submitting}
                          className="text-xs"
                          aria-label={`${
                            type.activo ? "Desactivar" : "Activar"
                          } tipo ${type.nombre}`}
                        >
                          {isToggling
                            ? "Guardando..."
                            : type.activo
                            ? "Desactivar"
                            : "Activar"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </ResourceState>
    </div>
  );
}
