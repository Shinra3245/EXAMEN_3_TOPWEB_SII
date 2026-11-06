const DIAS = [
  { id: "lunes", nombre: "Lunes" },
  { id: "martes", nombre: "Martes" },
  { id: "miercoles", nombre: "Miércoles" },
  { id: "jueves", nombre: "Jueves" },
  { id: "viernes", nombre: "Viernes" },
  { id: "sabado", nombre: "Sábado" },
];

const HORA_INICIAL = 8;
const HORA_FINAL = 16;
// Debe coincidir con --hour-height en styles.css.
const ALTURA_POR_HORA = 48;

const PERIODO_26_2 = "Agosto - Diciembre 2026 · 26/2 · 2026";
const PERIODO_26_1 = "Enero - Junio 2026 · 26/1 · 2026";

const clases = [
  // Lunes
  {
    dia: "lunes",
    inicio: "09:00",
    fin: "10:00",
    materia: "DESARROLLOS MÓVILES Y TECNOLOGÍAS EN LA NUBE",
    idMateria: "IDD-2503",
    salon: "LMM",
    periodo: PERIODO_26_2,
    periodoId: "26/2 2026",
    color: "blue",
  },
  {
    dia: "lunes",
    inicio: "11:00",
    fin: "12:00",
    materia: "TÓPICOS AVANZADOS DE DESARROLLO WEB",
    idMateria: "IDD-2504",
    salon: "LPA",
    periodo: PERIODO_26_2,
    periodoId: "26/2 2026",
    color: "violet",
  },
  {
    dia: "lunes",
    inicio: "13:00",
    fin: "14:00",
    materia: "English for Life and Work 7",
    idMateria: "ELW7",
    salon: "I17",
    periodo: PERIODO_26_2,
    periodoId: "26/2 2026",
    color: "orange",
  },

  // Miércoles
  {
    dia: "miercoles",
    inicio: "09:00",
    fin: "11:00",
    materia: "DESARROLLOS MÓVILES Y TECNOLOGÍAS EN LA NUBE",
    idMateria: "IDD-2503",
    salon: "LMM",
    periodo: PERIODO_26_2,
    periodoId: "26/2 2026",
    color: "blue",
  },
  {
    dia: "miercoles",
    inicio: "11:00",
    fin: "13:00",
    materia: "TÓPICOS AVANZADOS DE DESARROLLO WEB",
    idMateria: "IDD-2504",
    salon: "LPA",
    periodo: PERIODO_26_2,
    periodoId: "26/2 2026",
    color: "violet",
  },
  {
    dia: "miercoles",
    inicio: "13:00",
    fin: "15:00",
    materia: "English for Life and Work 7",
    idMateria: "ELW7",
    salon: "I17",
    periodo: PERIODO_26_2,
    periodoId: "26/2 2026",
    color: "orange",
  },

  // Viernes
  {
    dia: "viernes",
    inicio: "09:00",
    fin: "11:00",
    materia: "DESARROLLOS MÓVILES Y TECNOLOGÍAS EN LA NUBE",
    idMateria: "IDD-2503",
    salon: "LMM",
    periodo: PERIODO_26_2,
    periodoId: "26/2 2026",
    color: "blue",
  },
  {
    dia: "viernes",
    inicio: "11:00",
    fin: "13:00",
    materia: "TÓPICOS AVANZADOS DE DESARROLLO WEB",
    idMateria: "IDD-2504",
    salon: "LPA",
    periodo: PERIODO_26_2,
    periodoId: "26/2 2026",
    color: "violet",
  },
  {
    dia: "viernes",
    inicio: "13:00",
    fin: "15:00",
    materia: "English for Life and Work 7",
    idMateria: "ELW7",
    salon: "I17",
    periodo: PERIODO_26_2,
    periodoId: "26/2 2026",
    color: "orange",
  },
];

const periodFilter = document.querySelector("#periodFilter");
const calendarHeader = document.querySelector("#calendarHeader");
const timeAxis = document.querySelector("#timeAxis");
const weekColumns = document.querySelector("#weekColumns");
const emptyState = document.querySelector("#emptyState");
const scheduleStatus = document.querySelector("#scheduleStatus");

function crearElemento(tagName, className, text) {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  if (text) {
    element.textContent = text;
  }

  return element;
}

function formatearHora(hora) {
  const [horas, minutos] = hora.split(":").map(Number);
  const sufijo = horas >= 12 ? "PM" : "AM";
  const hora12 = horas % 12 || 12;

  return `${String(hora12).padStart(2, "0")}:${String(minutos).padStart(
    2,
    "0",
  )} ${sufijo}`;
}

function formatearEtiquetaDeHora(hora) {
  const sufijo = hora >= 12 ? "PM" : "AM";
  const hora12 = hora % 12 || 12;

  return `${String(hora12).padStart(2, "0")}:00 ${sufijo}`;
}

function obtenerMinutos(hora) {
  const [horas, minutos] = hora.split(":").map(Number);

  return horas * 60 + minutos;
}

function crearEncabezado(diasVisibles) {
  calendarHeader.replaceChildren();

  const timeHeading = crearElemento("div", "calendar-header__time", "Hora");
  calendarHeader.append(timeHeading);

  const dayHeadings = crearElemento("div", "calendar-header__days");
  dayHeadings.style.gridTemplateColumns = `repeat(${diasVisibles.length}, minmax(120px, 1fr))`;

  diasVisibles.forEach((dia) => {
    const heading = crearElemento("div", "calendar-day-heading");
    heading.append(crearElemento("span", "", dia.nombre));
    dayHeadings.append(heading);
  });

  calendarHeader.append(dayHeadings);
}

function crearEjeDeHoras() {
  timeAxis.replaceChildren();

  for (let hora = HORA_INICIAL; hora < HORA_FINAL; hora += 1) {
    const horaTexto = formatearEtiquetaDeHora(hora);
    const label = crearElemento("span", "time-label", horaTexto);
    label.style.top = `${(hora - HORA_INICIAL) * ALTURA_POR_HORA}px`;
    timeAxis.append(label);
  }

  const finalLabel = crearElemento(
    "span",
    "time-label time-label--last",
    formatearEtiquetaDeHora(HORA_FINAL),
  );
  timeAxis.append(finalLabel);
}

function crearLineaDeHora() {
  const lines = document.createElement("div");

  for (let hora = HORA_INICIAL; hora < HORA_FINAL; hora += 1) {
    lines.append(crearElemento("div", "hour-line"));
  }

  return lines;
}

function crearTarjeta(clase) {
  const inicioMinutos = obtenerMinutos(clase.inicio);
  const finMinutos = obtenerMinutos(clase.fin);
  const duracion = finMinutos - inicioMinutos;
  const minutosDesdeInicio = inicioMinutos - HORA_INICIAL * 60;
  const top = (minutosDesdeInicio / 60) * ALTURA_POR_HORA;
  const height = (duracion / 60) * ALTURA_POR_HORA - 4;

  const esCompacta = duracion <= 60;

  const card = crearElemento(
    "article",
    `class-card class-card--${clase.color}${
      esCompacta ? " class-card--compact" : ""
    }`,
  );

  card.style.top = `${top}px`;
  card.style.height = `${height}px`;
  card.title = `${clase.materia} · ${clase.idMateria} · Salón ${clase.salon} · ${formatearHora(
    clase.inicio,
  )} a ${formatearHora(clase.fin)}`;

  const hora = `${formatearHora(clase.inicio)} – ${formatearHora(clase.fin)}`;
  card.append(crearElemento("p", "class-card__time", hora));
  card.append(crearElemento("h3", "", clase.materia));
  card.append(crearElemento("p", "", `No. de materia: ${clase.idMateria}`));
  card.append(crearElemento("p", "", `Salón: ${clase.salon}`));
  card.append(crearElemento("p", "class-card__period", clase.periodo));

  return card;
}

function mostrarClases(clasesVisibles, diasVisibles) {
  crearEncabezado(diasVisibles);
  crearEjeDeHoras();
  weekColumns.replaceChildren();
  weekColumns.style.gridTemplateColumns = `repeat(${diasVisibles.length}, minmax(120px, 1fr))`;

  diasVisibles.forEach((dia) => {
    const dayColumn = crearElemento("div", "day-column");
    dayColumn.setAttribute("aria-label", `Clases del ${dia.nombre}`);
    dayColumn.append(crearLineaDeHora());

    const clasesDelDia = clasesVisibles
      .filter((clase) => clase.dia === dia.id)
      .sort((a, b) => a.inicio.localeCompare(b.inicio));

    clasesDelDia.forEach((clase) => {
      dayColumn.append(crearTarjeta(clase));
    });

    weekColumns.append(dayColumn);
  });

  emptyState.hidden = clasesVisibles.length !== 0;
}

function filtrarClases(filtros) {
  return clases.filter((clase) => {
    return !filtros.periodo || clase.periodoId === filtros.periodo;
  });
}

function aplicarFiltros() {
  const filtros = { periodo: periodFilter.value };
  const clasesVisibles = filtrarClases(filtros);

  mostrarClases(clasesVisibles, DIAS);

  scheduleStatus.textContent =
    clasesVisibles.length === 0
      ? "0 sesiones mostradas; 0 franjas sin interpretar."
      : `${clasesVisibles.length} sesiones mostradas; 0 franjas sin interpretar.`;
}

function iniciarHorario() {
  aplicarFiltros();
  periodFilter.addEventListener("change", aplicarFiltros);
}

iniciarHorario();