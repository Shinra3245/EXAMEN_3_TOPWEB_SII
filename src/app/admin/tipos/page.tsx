"use client";

import { useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useResource } from "@/hooks/use-resource";
import { ResourceState } from "@/components/resource-state";
import { apiRequest, ApiClientError } from "@/lib/api-client";
import type { FaultTypeDTO } from "@/types/api";
import {
  IconAdminTipos,
  IconCheck,
  IconAlert,
} from "@/components/visual-icons";

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
    return (
      <div className="visual-card p-8 text-center text-muted">
        <p className="font-semibold">Cargando perfil administrativo...</p>
      </div>
    );
  }

  if (!esAdmin) {
    return (
      <section role="alert" className="visual-card p-8 text-center border-red-300">
        <h1 className="text-xl font-bold text-red-700">Acceso no autorizado</h1>
        <p className="mt-2 text-muted">
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
      setSuccessMsg(
        editingId === null
          ? "Tipo de falla agregado correctamente."
          : "Nombre del tipo de falla actualizado correctamente."
      );
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
    <div className="admin-types-view flex flex-col gap-6">
      <header>
        <div className="flex items-center gap-3">
          <IconAdminTipos size={26} className="text-blue-600" />
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Catálogo de tipos de falla
          </h1>
        </div>
        <p className="text-sm text-muted mt-1 max-w-2xl">
          Configuración administrativa del catálogo de opciones disponibles al
          reportar averías en aulas.
        </p>
      </header>

      {successMsg && (
        <div
          role="status"
          className="p-3 bg-green-50 text-green-800 border border-green-200 rounded font-semibold text-sm flex items-center gap-2"
        >
          <IconCheck size={18} className="text-green-600" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div
          role="alert"
          className="p-3 bg-red-50 text-red-800 border border-red-200 rounded font-semibold text-sm flex items-center gap-2"
        >
          <IconAlert size={18} className="text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Formulario para añadir o editar tipo */}
      <section
        aria-labelledby="nuevo-tipo-heading"
        className="visual-card p-5"
      >
        <h2 id="nuevo-tipo-heading" className="text-base font-bold mb-3">
          {editingId === null
            ? "Agregar nuevo tipo de falla"
            : "Editar tipo de falla"}
        </h2>
        <form onSubmit={handleCreateType} className="flex flex-wrap gap-3 items-end">
          <label className="flex-1 min-w-[260px]">
            <span>Nombre del tipo de falla:</span>
            <input
              ref={nameInput}
              type="text"
              placeholder="Ej. Cortinas / Persianas, Iluminación..."
              value={nuevoNombre}
              disabled={submitting}
              maxLength={100}
              onChange={(e) => setNuevoNombre(e.target.value)}
              required
            />
          </label>
          <button
            type="submit"
            disabled={submitting || !nuevoNombre.trim()}
            className="btn-primary"
          >
            {submitting
              ? "Guardando..."
              : editingId === null
              ? "Agregar al catálogo"
              : "Guardar nombre"}
          </button>
          {editingId !== null && (
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setEditingId(null);
                setNuevoNombre("");
                setErrorMsg(null);
              }}
              className="btn-secondary"
            >
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
        <section aria-labelledby="catalogo-heading">
          <h2 id="catalogo-heading" className="text-lg font-bold mb-2">
            Tipos registrados ({types.length})
          </h2>

          <div className="table-scroll">
            <table>
              <caption>
                Catálogo completo de fallas con estado activo/inactivo
              </caption>
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
                      <td className="font-mono text-xs">{type.id}</td>
                      <td>
                        <strong className="text-main">{type.nombre}</strong>
                      </td>
                      <td>
                        <span
                          className={`inline-block px-2.5 py-0.5 text-xs font-bold rounded-full ${
                            type.activo
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-200 text-gray-700"
                          }`}
                        >
                          {type.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="text-xs text-muted whitespace-nowrap">
                        {type.creado_en
                          ? new Date(type.creado_en).toLocaleDateString("es-MX")
                          : "-"}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
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
                            className="btn-secondary text-xs"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleActivo(type)}
                            disabled={togglingId !== null || submitting}
                            className="btn-secondary text-xs"
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
                        </div>
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
