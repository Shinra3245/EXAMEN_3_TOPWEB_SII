import "server-only";
import { requireSession } from "@/lib/session";
import { withStudentDatabase } from "@/lib/student-database";
import { validateSameOrigin, setPrivateCacheHeaders } from "@/lib/security";
import { readBoundedText } from "@/lib/bounded-json";
import { isAdministrator } from "@/config/env";
import { fetchSiiResource, SII_ENDPOINTS } from "@/lib/sii-client";
import { normalizeSchedule } from "@/lib/normalizers/schedule";
import {
  ValidationError,
  ConflictError,
  NotFoundError,
  ForbiddenError,
  toSafeErrorResponse,
} from "@/lib/errors";
import type {
  RoomReportDTO,
  ReportEventDTO,
  FaultTypeDTO,
  ReportsSummaryDTO,
  ReportEstado,
  ReportPrioridad,
} from "@/types/api";
import type { DiaSemana } from "@/types/normalizers";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIME_REGEX = /^[0-2][0-9]:[0-5][0-9]$/;
const VALID_DIAS: DiaSemana[] = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
];
const VALID_ESTADOS: ReportEstado[] = [
  "recibido",
  "en_revision",
  "resuelto",
  "cerrado",
  "descartado",
];
const VALID_TRANSITIONS: Record<ReportEstado, ReportEstado[]> = {
  recibido: ["en_revision", "descartado"],
  en_revision: ["resuelto", "descartado", "recibido"],
  resuelto: ["cerrado", "en_revision"],
  cerrado: [],
  descartado: [],
};

/**
 * GET /api/reports
 * Consulta lista de reportes con filtros opcionales (salon, tipo_id, estado, periodo, mine).
 * Anonimiza las identidades para alumnos regulares y las preserva para administradores.
 */
export async function handleListReports(req: Request): Promise<Response> {
  try {
    const session = await requireSession(req);
    const isAdmin = isAdministrator(session.numero_control);
    const url = new URL(req.url);

    const filterSalon = url.searchParams.get("salon")?.trim() || null;
    const filterTipoIdRaw = url.searchParams.get("tipo_id");
    const filterTipoId = filterTipoIdRaw ? parseInt(filterTipoIdRaw, 10) : null;
    const filterEstado = url.searchParams.get("estado")?.trim() || null;
    const filterPeriodo = url.searchParams.get("periodo")?.trim() || null;
    const filterMine =
      url.searchParams.get("mine") === "1" ||
      url.searchParams.get("mine") === "true";

    const reports = await withStudentDatabase(req, async (client) => {
      const conditions: string[] = ["1=1"];
      const params: unknown[] = [session.numero_control];

      if (filterSalon) {
        params.push(`%${filterSalon}%`);
        conditions.push(`r.salon ILIKE $${params.length}`);
      }

      if (filterTipoId !== null && !isNaN(filterTipoId)) {
        params.push(filterTipoId);
        conditions.push(`r.tipo_id = $${params.length}`);
      }

      if (filterEstado) {
        params.push(filterEstado);
        conditions.push(`r.estado = $${params.length}`);
      }

      if (filterPeriodo) {
        params.push(filterPeriodo);
        conditions.push(`r.periodo = $${params.length}`);
      }

      if (filterMine) {
        params.push(session.numero_control);
        conditions.push(`r.reporter_id = $${params.length}`);
      }

      const sql = `
        SELECT
          r.id,
          r.salon,
          r.clave_materia,
          r.nombre_materia,
          r.dia,
          r.hora_inicio,
          r.hora_fin,
          r.periodo,
          r.tipo_id,
          COALESCE(ft.nombre, 'Tipo de falla no disponible') AS tipo_nombre,
          r.descripcion,
          r.estado,
          r.prioridad,
          r.reporter_id,
          r.creado_en,
          r.actualizado_en,
          COALESCE(c_count.cnt, 0)::int AS apoyos_conteo,
          EXISTS(
            SELECT 1 FROM app.report_confirmations c
            WHERE c.report_id = r.id AND c.student_id = $1
          ) AS lo_apoye,
          (r.reporter_id = $1) AS es_mio
        FROM app.v_room_reports r
        LEFT JOIN app.fault_types ft ON r.tipo_id = ft.id
        LEFT JOIN app.report_confirmation_counts c_count ON c_count.report_id = r.id
        WHERE ${conditions.join(" AND ")}
        ORDER BY r.creado_en DESC
      `;

      const result = await client.query(sql, params);
      const rows = result.rows;

      if (!rows.length) {
        return [];
      }

      const reportIds = rows.map((row) => row.id);

      // Cargar eventos del historial para estos reportes
      const eventsResult = await client.query(
        `SELECT
           id,
           report_id,
           actor_admin,
           estado_anterior,
           estado_nuevo,
           prioridad_anterior,
           prioridad_nueva,
           comentario,
           creado_en
         FROM app.v_report_events
         WHERE report_id = ANY($1::uuid[])
         ORDER BY creado_en ASC`,
        [reportIds]
      );

      const eventsByReport = new Map<string, ReportEventDTO[]>();
      for (const ev of eventsResult.rows) {
        const list = eventsByReport.get(ev.report_id) || [];
        list.push({
          id: ev.id,
          report_id: ev.report_id,
          actor_admin: isAdmin ? ev.actor_admin : undefined,
          estado_anterior: ev.estado_anterior,
          estado_nuevo: ev.estado_nuevo,
          prioridad_anterior: ev.prioridad_anterior,
          prioridad_nueva: ev.prioridad_nueva,
          comentario: ev.comentario,
          creado_en:
            ev.creado_en instanceof Date
              ? ev.creado_en.toISOString()
              : String(ev.creado_en),
        });
        eventsByReport.set(ev.report_id, list);
      }

      // Si es admin, cargar también la lista de números de control que apoyaron
      let confirmationsByReport: Map<string, string[]> | null = null;
      if (isAdmin) {
        confirmationsByReport = new Map<string, string[]>();
        const confResult = await client.query(
          `SELECT report_id, student_id
           FROM app.report_confirmations
           WHERE report_id = ANY($1::uuid[])`,
          [reportIds]
        );
        for (const row of confResult.rows) {
          const list = confirmationsByReport.get(row.report_id) || [];
          list.push(row.student_id);
          confirmationsByReport.set(row.report_id, list);
        }
      }

      return rows.map((row): RoomReportDTO => {
        const item: RoomReportDTO = {
          id: row.id,
          salon: row.salon,
          clave_materia: row.clave_materia,
          nombre_materia: row.nombre_materia,
          dia: row.dia,
          hora_inicio: row.hora_inicio,
          hora_fin: row.hora_fin,
          periodo: row.periodo,
          tipo_id: Number(row.tipo_id),
          tipo_nombre: row.tipo_nombre,
          descripcion: row.descripcion,
          estado: row.estado as ReportEstado,
          prioridad: (row.prioridad as ReportPrioridad) || null,
          creado_en:
            row.creado_en instanceof Date
              ? row.creado_en.toISOString()
              : String(row.creado_en),
          actualizado_en:
            row.actualizado_en instanceof Date
              ? row.actualizado_en.toISOString()
              : String(row.actualizado_en),
          apoyos_conteo: Number(row.apoyos_conteo),
          lo_apoye: Boolean(row.lo_apoye),
          es_mio: Boolean(row.es_mio),
          historial: eventsByReport.get(row.id) || [],
        };

        if (isAdmin) {
          item.reporter_id = row.reporter_id;
          item.apoyos_estudiantes =
            confirmationsByReport?.get(row.id) || [];
        }

        return item;
      });
    });

    const headers = new Headers();
    setPrivateCacheHeaders(headers);

    return Response.json(
      {
        success: true,
        data: reports,
      },
      {
        status: 200,
        headers,
      }
    );
  } catch (error) {
    return toSafeErrorResponse(error, "Error al consultar los reportes de aula");
  }
}

/**
 * POST /api/reports/create
 * Registra un nuevo reporte exclusivamente a partir de una sesión del horario del alumno.
 * Revalida salón/materia/día/hora consultando el servicio SII institucional.
 */
export async function handleCreateReport(req: Request): Promise<Response> {
  try {
    validateSameOrigin(req);
    const session = await requireSession(req);

    let body: Record<string, unknown>;
    try {
      const raw = await readBoundedText(req, 16384);
      body = JSON.parse(raw);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new Error("Invalid json");
      }
    } catch {
      throw new ValidationError("Cuerpo de petición JSON no válido");
    }

    const claveMateria =
      typeof body.clave_materia === "string" ? body.clave_materia.trim() : "";
    const dia = typeof body.dia === "string" ? body.dia.trim().toLowerCase() : "";
    const horaInicio =
      typeof body.hora_inicio === "string" ? body.hora_inicio.trim() : "";
    const horaFin =
      typeof body.hora_fin === "string" ? body.hora_fin.trim() : "";
    const tipoId =
      typeof body.tipo_id === "number"
        ? body.tipo_id
        : parseInt(String(body.tipo_id), 10);
    const descripcion =
      typeof body.descripcion === "string" ? body.descripcion.trim() : "";
    const clientSalon =
      typeof body.salon === "string" ? body.salon.trim() : null;
    const clientPeriodo =
      typeof body.periodo === "string" ? body.periodo.trim() : null;
    const clientClavePeriodo =
      typeof body.clave_periodo === "string" ? body.clave_periodo.trim() : null;

    if (!claveMateria || claveMateria.length > 50) {
      throw new ValidationError("Clave de materia obligatoria (máx 50 caracteres)");
    }
    if (!VALID_DIAS.includes(dia as DiaSemana)) {
      throw new ValidationError("Día de la semana no válido");
    }
    if (!TIME_REGEX.test(horaInicio) || !TIME_REGEX.test(horaFin)) {
      throw new ValidationError("Formato de horario no válido (se requiere HH:MM)");
    }
    if (isNaN(tipoId) || tipoId <= 0) {
      throw new ValidationError("Tipo de falla no válido");
    }
    if (!descripcion || descripcion.length > 500) {
      throw new ValidationError("La descripción es obligatoria (entre 1 y 500 caracteres)");
    }

    // 1. Revalidar contra el horario real del alumno consultando el SII
    const rawSchedule = await fetchSiiResource<unknown>(
      SII_ENDPOINTS.SCHEDULE,
      session.token
    );
    const schedulePeriods = normalizeSchedule(rawSchedule);

    const candidateSessions: Array<{
      salon: string;
      nombre_materia: string;
      clave_materia: string;
      dia: DiaSemana;
      inicio: string;
      fin: string;
      periodo: string;
    }> = [];

    for (const periodGroup of schedulePeriods) {
      const periodoStr =
        periodGroup.periodo?.descripcion_periodo ||
        periodGroup.periodo?.clave_periodo ||
        "Periodo actual";
      const clavePeriodoStr = periodGroup.periodo?.clave_periodo || "";
      const descPeriodoStr = periodGroup.periodo?.descripcion_periodo || "";

      // Si el cliente especificó clave_periodo o periodo, filtrar
      if (
        clientClavePeriodo &&
        clavePeriodoStr &&
        clientClavePeriodo.toLowerCase() !== clavePeriodoStr.toLowerCase()
      ) {
        continue;
      }
      if (
        clientPeriodo &&
        clientPeriodo.toLowerCase() !== periodoStr.toLowerCase() &&
        clientPeriodo.toLowerCase() !== descPeriodoStr.toLowerCase() &&
        clientPeriodo.toLowerCase() !== clavePeriodoStr.toLowerCase()
      ) {
        continue;
      }

      for (const subject of periodGroup.horario) {
        if (subject.clave_materia !== claveMateria) continue;

        for (const ses of subject.sesiones) {
          if (
            ses.dia === dia &&
            ses.inicio === horaInicio &&
            ses.fin === horaFin &&
            ses.salon &&
            ses.salon.trim().length > 0
          ) {
            // Si el cliente envió salón, verificar coincidencia institucional
            if (
              clientSalon &&
              ses.salon.trim().toLowerCase() !== clientSalon.toLowerCase()
            ) {
              continue;
            }

            candidateSessions.push({
              salon: ses.salon.trim(),
              nombre_materia: subject.nombre_materia,
              clave_materia: subject.clave_materia,
              dia: ses.dia,
              inicio: ses.inicio,
              fin: ses.fin,
              periodo: periodoStr,
            });
          }
        }
      }
    }

    if (candidateSessions.length === 0) {
      throw new ValidationError(
        "La sesión seleccionada no pertenece al horario registrado del alumno, no tiene aula asignada o no coincide con el periodo y aula asignados"
      );
    }

    if (candidateSessions.length > 1) {
      throw new ValidationError(
        "Existen múltiples sesiones coincidentes en diferentes periodos o aulas; especifique el periodo o aula exactos"
      );
    }

    const matchedSession = candidateSessions[0];

    // 2. Persistir en la base de datos dentro del contexto del alumno
    const newReport = await withStudentDatabase(req, async (client) => {
      // Validar tipo de falla activo
      const typeCheck = await client.query(
        "SELECT id FROM app.fault_types WHERE id = $1 AND activo = true",
        [tipoId]
      );
      if (!typeCheck.rows.length) {
        throw new ValidationError("El tipo de falla seleccionado no existe o está inactivo");
      }

      // Validar que el alumno no tenga ya un reporte abierto para la misma sesión de clase
      const openDuplicateRes = await client.query(
        `SELECT id FROM app.room_reports
         WHERE reporter_id = $1
           AND salon = $2
           AND clave_materia = $3
           AND dia = $4
           AND hora_inicio = $5
           AND hora_fin = $6
           AND periodo = $7
           AND estado IN ('recibido', 'en_revision')
         LIMIT 1`,
        [
          session.numero_control,
          matchedSession.salon,
          matchedSession.clave_materia,
          matchedSession.dia,
          matchedSession.inicio,
          matchedSession.fin,
          matchedSession.periodo,
        ]
      );
      if (openDuplicateRes.rows.length) {
        throw new ConflictError(
          "Ya tienes un reporte abierto para esta misma sesión de clase"
        );
      }

      let insertResult;
      try {
        insertResult = await client.query(
          `INSERT INTO app.room_reports (
             salon,
             clave_materia,
             nombre_materia,
             dia,
             hora_inicio,
             hora_fin,
             periodo,
             tipo_id,
             descripcion,
             estado,
             reporter_id
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'recibido', $10)
           RETURNING id, creado_en`,
          [
            matchedSession.salon,
            matchedSession.clave_materia,
            matchedSession.nombre_materia,
            matchedSession.dia,
            matchedSession.inicio,
            matchedSession.fin,
            matchedSession.periodo,
            tipoId,
            descripcion,
            session.numero_control,
          ]
        );
      } catch (insertError: unknown) {
        if (
          insertError instanceof Error &&
          (("code" in insertError &&
            (insertError as { code: string }).code === "23505") ||
            insertError.message.includes(
              "uq_room_reports_open_session_reporter"
            ))
        ) {
          throw new ConflictError(
            "Ya tienes un reporte abierto para esta misma sesión de clase"
          );
        }
        throw insertError;
      }

      return insertResult.rows[0];
    });

    const headers = new Headers();
    setPrivateCacheHeaders(headers);

    return Response.json(
      {
        success: true,
        data: {
          id: newReport.id,
          message: "Reporte creado exitosamente",
        },
      },
      {
        status: 201,
        headers,
      }
    );
  } catch (error) {
    return toSafeErrorResponse(error, "Fallo al registrar el reporte de falla");
  }
}

/**
 * POST /api/reports/confirm
 * Permite a cualquier alumno apoyar ("también me pasa") un reporte abierto.
 * Un solo apoyo por alumno por reporte; no permite apoyar el propio.
 */
export async function handleConfirmReport(req: Request): Promise<Response> {
  try {
    validateSameOrigin(req);
    const session = await requireSession(req);

    let body: Record<string, unknown>;
    try {
      const raw = await readBoundedText(req, 4096);
      body = JSON.parse(raw);
    } catch {
      throw new ValidationError("Cuerpo de petición JSON no válido");
    }

    const reportId =
      typeof body.report_id === "string" ? body.report_id.trim() : "";
    if (!UUID_REGEX.test(reportId)) {
      throw new ValidationError("Identificador de reporte no válido");
    }

    await withStudentDatabase(req, async (client) => {
      const reportRes = await client.query(
        "SELECT id, estado, reporter_id FROM app.v_room_reports WHERE id = $1",
        [reportId]
      );
      if (!reportRes.rows.length) {
        throw new NotFoundError("El reporte solicitado no existe");
      }

      const report = reportRes.rows[0];
      if (report.estado !== "recibido" && report.estado !== "en_revision") {
        throw new ConflictError(
          "Solo se pueden apoyar reportes abiertos (en estado recibido o en revisión)"
        );
      }

      if (report.reporter_id === session.numero_control) {
        throw new ConflictError("No puedes apoyar un reporte creado por ti mismo");
      }

      const confRes = await client.query(
        "SELECT 1 FROM app.report_confirmations WHERE report_id = $1 AND student_id = $2",
        [reportId, session.numero_control]
      );
      if (confRes.rows.length) {
        throw new ConflictError("Ya has apoyado este reporte anteriormente");
      }

      await client.query(
        "INSERT INTO app.report_confirmations (report_id, student_id) VALUES ($1, $2)",
        [reportId, session.numero_control]
      );
    });

    const headers = new Headers();
    setPrivateCacheHeaders(headers);

    return Response.json(
      {
        success: true,
        data: {
          message: "Apoyo registrado exitosamente",
        },
      },
      {
        status: 200,
        headers,
      }
    );
  } catch (error) {
    return toSafeErrorResponse(error, "Fallo al registrar el apoyo al reporte");
  }
}

/**
 * POST /api/reports/withdraw
 * Permite al autor original retirar su propio reporte únicamente mientras esté en estado 'recibido'.
 */
export async function handleWithdrawReport(req: Request): Promise<Response> {
  try {
    validateSameOrigin(req);
    const session = await requireSession(req);

    let body: Record<string, unknown>;
    try {
      const raw = await readBoundedText(req, 4096);
      body = JSON.parse(raw);
    } catch {
      throw new ValidationError("Cuerpo de petición JSON no válido");
    }

    const reportId =
      typeof body.report_id === "string" ? body.report_id.trim() : "";
    if (!UUID_REGEX.test(reportId)) {
      throw new ValidationError("Identificador de reporte no válido");
    }

    await withStudentDatabase(req, async (client) => {
      const reportRes = await client.query(
        "SELECT id, estado, reporter_id FROM app.v_room_reports WHERE id = $1",
        [reportId]
      );
      if (!reportRes.rows.length) {
        throw new NotFoundError("El reporte solicitado no existe");
      }

      const report = reportRes.rows[0];
      if (report.reporter_id !== session.numero_control) {
        throw new ForbiddenError(
          "FORBIDDEN",
          "Solo el autor del reporte puede retirarlo"
        );
      }

      if (report.estado !== "recibido") {
        throw new ConflictError(
          "El reporte solo puede retirarse mientras se encuentre en estado recibido"
        );
      }

      const deleteResult = await client.query(
        "DELETE FROM app.room_reports WHERE id = $1 AND reporter_id = $2 AND estado = 'recibido'",
        [reportId, session.numero_control]
      );

      if (!deleteResult.rowCount || deleteResult.rowCount === 0) {
        throw new ConflictError(
          "El reporte ya no se encuentra en estado recibido o no pudo ser retirado"
        );
      }
    });

    const headers = new Headers();
    setPrivateCacheHeaders(headers);

    return Response.json(
      {
        success: true,
        data: {
          message: "Reporte retirado exitosamente",
        },
      },
      {
        status: 200,
        headers,
      }
    );
  } catch (error) {
    return toSafeErrorResponse(error, "Fallo al retirar el reporte");
  }
}

/**
 * GET /api/report-types
 * Catálogo de tipos de fallas activos para estudiantes.
 */
export async function handleListFaultTypes(req: Request): Promise<Response> {
  try {
    await requireSession(req);

    const types = await withStudentDatabase(req, async (client) => {
      const res = await client.query(
        "SELECT id, nombre FROM app.fault_types WHERE activo = true ORDER BY id ASC"
      );
      return res.rows.map((row): FaultTypeDTO => ({
        id: Number(row.id),
        nombre: row.nombre,
      }));
    });

    const headers = new Headers();
    setPrivateCacheHeaders(headers);

    return Response.json(
      {
        success: true,
        data: types,
      },
      {
        status: 200,
        headers,
      }
    );
  } catch (error) {
    return toSafeErrorResponse(error, "Error al consultar los tipos de fallas");
  }
}

/**
 * POST /api/admin/reports/update
 * Actualiza el estado y/o prioridad de un reporte y registra el evento con comentario.
 * Requiere rol administrador (403 para alumnos regulares).
 */
export async function handleAdminUpdateReport(req: Request): Promise<Response> {
  try {
    validateSameOrigin(req);
    const session = await requireSession(req);

    if (!isAdministrator(session.numero_control)) {
      throw new ForbiddenError(
        "ADMIN_REQUIRED",
        "Acceso exclusivo para administradores"
      );
    }

    let body: Record<string, unknown>;
    try {
      const raw = await readBoundedText(req, 8192);
      body = JSON.parse(raw);
    } catch {
      throw new ValidationError("Cuerpo de petición JSON no válido");
    }

    const reportId =
      typeof body.report_id === "string" ? body.report_id.trim() : "";
    const estado =
      typeof body.estado === "string"
        ? (body.estado.trim() as ReportEstado)
        : undefined;
    const prioridad =
      body.prioridad !== undefined
        ? body.prioridad === null
          ? null
          : (String(body.prioridad).trim() as ReportPrioridad)
        : undefined;
    const comentario =
      typeof body.comentario === "string" ? body.comentario.trim() : "";

    if (!UUID_REGEX.test(reportId)) {
      throw new ValidationError("Identificador de reporte no válido");
    }
    if (!comentario || comentario.length > 1000) {
      throw new ValidationError(
        "El comentario es obligatorio para registrar cambios de gestión (máx 1000 caracteres)"
      );
    }
    if (estado && !VALID_ESTADOS.includes(estado)) {
      throw new ValidationError("Estado de reporte no válido");
    }
    if (
      prioridad !== undefined &&
      prioridad !== null &&
      !["baja", "media", "alta"].includes(prioridad)
    ) {
      throw new ValidationError("Prioridad no válida (debe ser baja, media o alta)");
    }

    await withStudentDatabase(req, async (client) => {
      const currentRes = await client.query(
        "SELECT id, estado, prioridad FROM app.room_reports WHERE id = $1 FOR UPDATE",
        [reportId]
      );
      if (!currentRes.rows.length) {
        throw new NotFoundError("El reporte solicitado no existe");
      }

      const current = currentRes.rows[0];
      const currentEstado = current.estado as ReportEstado;
      const currentPrioridad = (current.prioridad as ReportPrioridad) || null;

      // Validar transición de estado si cambia
      if (estado && estado !== currentEstado) {
        const allowedTransitions = VALID_TRANSITIONS[currentEstado] || [];
        if (!allowedTransitions.includes(estado)) {
          throw new ConflictError(
            `Transición de estado no permitida de '${currentEstado}' a '${estado}'`
          );
        }
      }

      const nextEstado = estado ?? currentEstado;
      const nextPrioridad =
        prioridad !== undefined ? prioridad : currentPrioridad;

      await client.query(
        `UPDATE app.room_reports
         SET estado = $1, prioridad = $2, actualizado_en = now()
         WHERE id = $3`,
        [nextEstado, nextPrioridad, reportId]
      );

      await client.query(
        `INSERT INTO app.report_events (
           report_id,
           actor_admin,
           estado_anterior,
           estado_nuevo,
           prioridad_anterior,
           prioridad_nueva,
           comentario
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          reportId,
          session.numero_control,
          currentEstado !== nextEstado ? currentEstado : null,
          nextEstado,
          currentPrioridad !== nextPrioridad ? currentPrioridad : null,
          nextPrioridad,
          comentario,
        ]
      );
    });

    const headers = new Headers();
    setPrivateCacheHeaders(headers);

    return Response.json(
      {
        success: true,
        data: {
          message: "Reporte actualizado exitosamente",
        },
      },
      {
        status: 200,
        headers,
      }
    );
  } catch (error) {
    return toSafeErrorResponse(error, "Fallo al actualizar el reporte");
  }
}

/**
 * GET /api/admin/report-types
 * Catálogo completo de tipos de fallas (incluidos inactivos) para gestión de administración.
 */
export async function handleAdminListFaultTypes(
  req: Request
): Promise<Response> {
  try {
    const session = await requireSession(req);
    if (!isAdministrator(session.numero_control)) {
      throw new ForbiddenError(
        "ADMIN_REQUIRED",
        "Acceso exclusivo para administradores"
      );
    }

    const types = await withStudentDatabase(req, async (client) => {
      const res = await client.query(
        "SELECT id, nombre, activo, creado_en FROM app.fault_types ORDER BY id ASC"
      );
      return res.rows.map((row): FaultTypeDTO => ({
        id: Number(row.id),
        nombre: row.nombre,
        activo: Boolean(row.activo),
        creado_en:
          row.creado_en instanceof Date
            ? row.creado_en.toISOString()
            : String(row.creado_en),
      }));
    });

    const headers = new Headers();
    setPrivateCacheHeaders(headers);

    return Response.json(
      {
        success: true,
        data: types,
      },
      {
        status: 200,
        headers,
      }
    );
  } catch (error) {
    return toSafeErrorResponse(
      error,
      "Error al consultar el catálogo administrativo de fallas"
    );
  }
}

/**
 * POST /api/admin/report-types/save
 * Crear o editar un tipo de falla en el catálogo.
 */
export async function handleAdminSaveFaultType(
  req: Request
): Promise<Response> {
  try {
    validateSameOrigin(req);
    const session = await requireSession(req);

    if (!isAdministrator(session.numero_control)) {
      throw new ForbiddenError(
        "ADMIN_REQUIRED",
        "Acceso exclusivo para administradores"
      );
    }

    let body: Record<string, unknown>;
    try {
      const raw = await readBoundedText(req, 4096);
      body = JSON.parse(raw);
    } catch {
      throw new ValidationError("Cuerpo de petición JSON no válido");
    }

    const id =
      body.id !== undefined && body.id !== null
        ? parseInt(String(body.id), 10)
        : null;
    const nombre =
      typeof body.nombre === "string" ? body.nombre.trim() : "";
    const activo =
      body.activo !== undefined ? Boolean(body.activo) : undefined;

    if (!nombre || nombre.length > 100) {
      throw new ValidationError("El nombre del tipo de falla es obligatorio (máx 100 caracteres)");
    }

    await withStudentDatabase(req, async (client) => {
      if (id !== null && !isNaN(id)) {
        const updateRes = await client.query(
          `UPDATE app.fault_types
           SET nombre = $1,
               activo = COALESCE($2, activo)
           WHERE id = $3
           RETURNING id`,
          [nombre, activo ?? null, id]
        );
        if (!updateRes.rows.length) {
          throw new NotFoundError("El tipo de falla a editar no existe");
        }
      } else {
        await client.query(
          `INSERT INTO app.fault_types (nombre, activo)
           VALUES ($1, COALESCE($2, true))`,
          [nombre, activo ?? true]
        );
      }
    });

    const headers = new Headers();
    setPrivateCacheHeaders(headers);

    return Response.json(
      {
        success: true,
        data: {
          message: "Tipo de falla guardado exitosamente",
        },
      },
      {
        status: 200,
        headers,
      }
    );
  } catch (error) {
    return toSafeErrorResponse(error, "Fallo al guardar el tipo de falla");
  }
}

/**
 * GET /api/admin/reports/summary
 * Métricas generales y salones con mayor número de reportes para el panel de administración.
 */
export async function handleAdminReportsSummary(
  req: Request
): Promise<Response> {
  try {
    const session = await requireSession(req);
    if (!isAdministrator(session.numero_control)) {
      throw new ForbiddenError(
        "ADMIN_REQUIRED",
        "Acceso exclusivo para administradores"
      );
    }

    const summary = await withStudentDatabase(req, async (client) => {
      const totalRes = await client.query(
        "SELECT count(*)::int AS total FROM app.room_reports"
      );
      const total = Number(totalRes.rows[0]?.total || 0);

      const estadosRes = await client.query(
        "SELECT estado, count(*)::int AS conteo FROM app.room_reports GROUP BY estado"
      );
      const porEstado: Record<ReportEstado, number> = {
        recibido: 0,
        en_revision: 0,
        resuelto: 0,
        cerrado: 0,
        descartado: 0,
      };
      for (const row of estadosRes.rows) {
        if (row.estado in porEstado) {
          porEstado[row.estado as ReportEstado] = Number(row.conteo);
        }
      }

      const roomsRes = await client.query(
        `SELECT
           salon,
           count(*)::int AS total_reportes,
           count(*) FILTER (WHERE estado IN ('recibido', 'en_revision'))::int AS abiertos,
           count(*) FILTER (WHERE estado = 'resuelto')::int AS resueltos
         FROM app.room_reports
         GROUP BY salon
         ORDER BY total_reportes DESC
         LIMIT 10`
      );

      return {
        total_reportes: total,
        por_estado: porEstado,
        salones_frecuentes: roomsRes.rows.map((r) => ({
          salon: r.salon,
          total_reportes: Number(r.total_reportes),
          abiertos: Number(r.abiertos),
          resueltos: Number(r.resueltos),
        })),
      };
    });

    const headers = new Headers();
    setPrivateCacheHeaders(headers);

    return Response.json(
      {
        success: true,
        data: summary,
      },
      {
        status: 200,
        headers,
      }
    );
  } catch (error) {
    return toSafeErrorResponse(
      error,
      "Error al generar el resumen administrativo de reportes"
    );
  }
}
