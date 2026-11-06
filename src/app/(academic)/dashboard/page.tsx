"use client";
/* eslint-disable @next/next/no-img-element -- imagen privada servida por el backend propio y mascota local */

import type { ComponentType } from "react";
import { useState } from "react";
import { useResource } from "@/hooks/use-resource";
import { ResourceState } from "@/components/resource-state";
import { useVisualTheme } from "@/components/visual-theme";
import type { StudentProfileDTO } from "@/types/normalizers";
import {
  IconRefresh,
  IconHome,
  IconStar,
  IconMedal,
  IconCalculator,
  IconLayers,
  IconBars,
  IconCircleCheck,
  IconCircleX,
  IconFlag,
  IconUser,
  VisualSparks,
} from "@/components/visual-icons";

const secondaryLabels: Record<string, string> = {
  materias_cursadas: "Materias cursadas",
  creditos_complementarios: "Créditos complementarios",
  percentaje_avance_cursando: "Avance con materias en curso (%)",
};

type Tone = "blue" | "yellow" | "mint" | "purple" | "pink";

interface Kpi {
  key: string;
  label: string;
  tone: Tone;
  icon: ComponentType<{ size?: number }>;
  percent?: boolean;
}

/** Ancho relativo de una barra respecto de la mayor del par; nunca inventa 0. */
function sharedScaleWidth(count: number, max: number): string {
  if (count <= 0 || max <= 0) return "0%";
  return `${(count / max) * 100}%`;
}

export default function DashboardPage() {
  const resource = useResource<StudentProfileDTO>("/api/student");
  const visual = useVisualTheme();
  const [photoFailed, setPhotoFailed] = useState(false);
  const [photoVersion, setPhotoVersion] = useState(0);

  const isIllustration = visual.style === "ilustracion";
  const indicadores = resource.data?.indicadores ?? {};

  const kpis: Kpi[] = [
    {
      key: "promedio_ponderado",
      label: "Promedio ponderado",
      tone: "blue",
      icon: isIllustration ? IconStar : IconMedal,
    },
    {
      key: "promedio_aritmetico",
      label: "Promedio aritmético",
      tone: "yellow",
      icon: IconCalculator,
    },
    {
      key: "creditos_acumulados",
      label: "Créditos acumulados",
      tone: "mint",
      icon: IconLayers,
    },
    {
      key: "porcentaje_avance",
      label: "Avance académico",
      tone: "blue",
      icon: IconBars,
      percent: true,
    },
    {
      key: "materias_aprobadas",
      label: "Materias aprobadas",
      tone: "purple",
      icon: IconCircleCheck,
    },
    {
      key: "materias_reprobadas",
      label: "Materias reprobadas",
      tone: "pink",
      icon: IconCircleX,
    },
  ];

  const avance = indicadores.porcentaje_avance;
  const hasAvance = avance !== null && avance !== undefined;
  const avancePct = hasAvance ? Math.min(100, Math.max(0, avance)) : 0;

  const aprobadas = indicadores.materias_aprobadas;
  const reprobadas = indicadores.materias_reprobadas;
  const hasAprobadas = aprobadas !== null && aprobadas !== undefined;
  const hasReprobadas = reprobadas !== null && reprobadas !== undefined;
  const sharedMax = Math.max(aprobadas ?? 0, reprobadas ?? 0);

  const handleRefreshProfile = () => {
    setPhotoFailed(false);
    setPhotoVersion((v) => v + 1);
    void resource.refresh();
  };

  return (
    <div className="dashboard-view" data-family={visual.style}>
      <div className="vs-page-head">
        {isIllustration && <IconHome size={36} className="vs-page-head-icon" />}
        <h1>Inicio</h1>
        {isIllustration && <span className="vs-page-head-line" aria-hidden="true" />}
      </div>

      <ResourceState
        {...resource}
        retry={() => {
          void resource.refresh();
        }}
      >
        {resource.data && (
          <div className="dash-grid">
            {/* Perfil */}
            <div className="dash-profile-col">
              {isIllustration && (
                <div className="dash-juanito" aria-hidden="true">
                  <img src="/assets/visual/juanito-flat.png" alt="" decoding="async" />
                  <VisualSparks size={44} className="dash-juanito-sparks" />
                </div>
              )}

              <section
                aria-labelledby="profile-title"
                className="dash-profile mos-corner mos-corner-tl mos-corner-br"
              >
                <div className="dash-photo">
                  {resource.data.foto && !photoFailed ? (
                    <img
                      key={photoVersion}
                      src={`/api/student/photo?v=${photoVersion}`}
                      alt="Fotografía del estudiante"
                      onError={() => setPhotoFailed(true)}
                    />
                  ) : (
                    <span className="dash-photo-empty" role="img" aria-label="Fotografía no disponible">
                      <IconUser size={44} />
                    </span>
                  )}
                </div>

                <div className="dash-identity">
                  <h2 id="profile-title">
                    {resource.data.persona || "Nombre no disponible"}
                  </h2>
                  <p className="dash-control">{resource.data.numero_control}</p>
                  <p className="dash-semester">
                    {resource.data.semestre
                      ? `Semestre ${resource.data.semestre}`
                      : "Semestre N/D"}
                  </p>
                  {!isIllustration && <p className="dash-email">
                    <strong>Correo:</strong> {resource.data.email || "No disponible"}
                  </p>}
                </div>

                {isIllustration && <p className="dash-email">
                  <strong>Correo:</strong> {resource.data.email || "No disponible"}
                </p>}

                {!isIllustration && (
                  <img
                    src="/assets/visual/juanito-pixel.png"
                    alt=""
                    aria-hidden="true"
                    className="dash-juanito-pixel"
                    decoding="async"
                  />
                )}

                <div className="dash-profile-action">
                  <button
                    type="button"
                    disabled={resource.loading}
                    onClick={handleRefreshProfile}
                    className="btn-primary"
                  >
                    <IconRefresh size={18} />
                    <span>{resource.loading ? "Actualizando..." : "Actualizar perfil"}</span>
                  </button>
                </div>
              </section>
            </div>

            {/* Indicadores y gráficos */}
            <div className="dash-data-col">
              <section aria-labelledby="indicators-title">
                <h2 id="indicators-title" className="sr-only">
                  Indicadores académicos
                </h2>
                <ul className="kpi-grid">
                  {kpis.map((kpi) => {
                    const raw = indicadores[kpi.key];
                    const has = raw !== null && raw !== undefined;
                    const Icon = kpi.icon;
                    return (
                      <li key={kpi.key} className="kpi" data-tone={kpi.tone}>
                        <span className="kpi-icon" aria-hidden="true">
                          <Icon size={40} />
                        </span>
                        <span className="kpi-label">{kpi.label}</span>
                        <span className="kpi-value">
                          {has ? `${raw}${kpi.percent ? "%" : ""}` : "N/D"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <div className="dash-panels">
                <section
                  aria-labelledby="progress-title"
                  className="dash-panel dash-progress mos-corner mos-corner-tr"
                >
                  <h2 id="progress-title">
                    <IconFlag size={30} className="dash-panel-icon" />
                    <span>Avance académico</span>
                  </h2>
                  {hasAvance ? (
                    <>
                      <p className="dash-progress-value">{avance}%</p>
                      <div
                        className="dash-progress-track"
                        role="progressbar"
                        aria-valuenow={avancePct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Avance académico: ${avance}%`}
                      >
                        <div
                          className="dash-progress-fill"
                          style={{ width: `${avancePct}%` }}
                        />
                        <span
                          className="dash-progress-tick"
                          style={{ left: `${avancePct}%` }}
                          aria-hidden="true"
                        />
                      </div>
                      <div className="dash-progress-axis" aria-hidden="true">
                        <span>0%</span>
                        <span>100%</span>
                      </div>
                    </>
                  ) : (
                    <p className="dash-empty">Avance no disponible.</p>
                  )}
                </section>

                <section
                  aria-labelledby="results-title"
                  className="dash-panel dash-results mos-corner mos-corner-tr"
                >
                  <h2 id="results-title">
                    <IconBars size={30} className="dash-panel-icon" />
                    <span>Materias por resultado</span>
                  </h2>
                  {hasAprobadas || hasReprobadas ? (
                    <ul className="dash-results-list">
                      <li>
                        <span className="dash-results-label">Aprobadas</span>
                        <span className="dash-results-count">
                          {hasAprobadas ? aprobadas : "N/D"}
                        </span>
                        <span className="dash-results-track">
                          {hasAprobadas && (
                            <span
                              className="dash-results-bar is-pass"
                              style={{ width: sharedScaleWidth(aprobadas, sharedMax) }}
                              role="img"
                              aria-label={`${aprobadas} materias aprobadas`}
                            />
                          )}
                        </span>
                      </li>
                      <li>
                        <span className="dash-results-label">Reprobadas</span>
                        <span className="dash-results-count">
                          {hasReprobadas ? reprobadas : "N/D"}
                        </span>
                        <span className="dash-results-track">
                          {hasReprobadas && (
                            <span
                              className="dash-results-bar is-fail"
                              style={{ width: sharedScaleWidth(reprobadas, sharedMax) }}
                              role="img"
                              aria-label={`${reprobadas} materias reprobadas`}
                            />
                          )}
                        </span>
                      </li>
                    </ul>
                  ) : (
                    <p className="dash-empty">Resultados no disponibles.</p>
                  )}
                </section>
              </div>

              <section aria-labelledby="sec-indicators-title" className="dash-secondary">
                <h2 id="sec-indicators-title">Otros indicadores oficiales</h2>
                <dl>
                  {Object.entries(secondaryLabels).map(([key, label]) => (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd>{indicadores[key] ?? "No disponible"}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <p className="vs-footnote">Indicadores oficiales del SII</p>
            </div>
          </div>
        )}
      </ResourceState>
    </div>
  );
}
