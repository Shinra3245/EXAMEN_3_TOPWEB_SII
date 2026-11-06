"use client";
/* eslint-disable @next/next/no-img-element -- private authenticated image served by own backend */
import Link from "next/link";
import { useState } from "react";
import { useResource } from "@/hooks/use-resource";
import { ResourceState } from "@/components/resource-state";
import type { StudentProfileDTO } from "@/types/normalizers";
// Etiquetas legibles para las claves recibidas desde /api/student.
// Se conserva el typo percentaje_avance_cursando del contrato del SII.
const labels: Record<string, string> = {
  creditos_acumulados: "Créditos acumulados",
  promedio_ponderado: "Promedio ponderado",
  promedio_aritmetico: "Promedio aritmético",
  materias_cursadas: "Materias cursadas",
  materias_reprobadas: "Materias reprobadas",
  materias_aprobadas: "Materias aprobadas",
  creditos_complementarios: "Créditos complementarios",
  porcentaje_avance: "Avance académico (%)",
  percentaje_avance_cursando: "Avance incluyendo materias en curso (%)",
};
export default function DashboardPage() {
  const resource = useResource<StudentProfileDTO>("/api/student");
  const [photoFailed, setPhotoFailed] = useState(false);
  // Cambiar la versión modifica la URL de la foto para solicitarla de nuevo.
  const [photoVersion, setPhotoVersion] = useState(0);
  return (
    <>
      <h1>Dashboard</h1>
      <p>Perfil e indicadores oficiales consultados en el SII.</p>
      <button
        type="button"
        disabled={resource.loading}
        onClick={() => {
          setPhotoFailed(false);
          setPhotoVersion((v) => v + 1);
          void resource.refresh();
        }}
      >
        Actualizar perfil
      </button>
      <ResourceState
        {...resource}
        retry={() => {
          void resource.refresh();
        }}
      >
        {resource.data && (
          <>
            <section aria-labelledby="profile-title">
              <h2 id="profile-title">Perfil del estudiante</h2>
              {resource.data.foto && !photoFailed ? (
                <img
                  key={photoVersion}
                  src={`/api/student/photo?v=${photoVersion}`}
                  alt="Fotografía del estudiante"
                  width="120"
                  height="150"
                  onError={() => setPhotoFailed(true)}
                />
              ) : (
                <p>Fotografía no disponible.</p>
              )}
              <dl>
                <dt>Nombre</dt>
                <dd>{resource.data.persona || "No disponible"}</dd>
                <dt>Número de control</dt>
                <dd>{resource.data.numero_control}</dd>
                <dt>Correo</dt>
                <dd>{resource.data.email || "No disponible"}</dd>
                <dt>Semestre</dt>
                <dd>{resource.data.semestre ?? "No disponible"}</dd>
              </dl>
            </section>
            <section aria-labelledby="indicators-title">
              <h2 id="indicators-title">Indicadores académicos</h2>
              <dl className="indicators">
                {Object.entries(labels).map(([key, label]) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>
                      {resource.data!.indicadores[key] ?? "No disponible"}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          </>
        )}
      </ResourceState>
      <nav aria-label="Consultas académicas">
        <ul>
          <li>
            <Link href="/calificaciones">Consultar calificaciones</Link>
          </li>
          <li>
            <Link href="/kardex">Consultar kardex</Link>
          </li>
          <li>
            <Link href="/horario">Consultar horario</Link>
          </li>
        </ul>
      </nav>
    </>
  );
}
