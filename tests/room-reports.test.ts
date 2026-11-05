import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  handleListReports,
  handleCreateReport,
  handleConfirmReport,
  handleWithdrawReport,
  handleListFaultTypes,
  handleAdminUpdateReport,
  handleAdminListFaultTypes,
  handleAdminSaveFaultType,
  handleAdminReportsSummary,
} from "@/server/room-reports";
import { handleSession } from "@/server/handlers";
import {
  withActorTransaction,
  withStudentDatabase,
} from "@/lib/student-database";
import { encryptSession } from "@/lib/crypto";

const base = "https://portal.example.invalid";
const secret = "ab".repeat(32);

const mockDb = vi.hoisted(() => ({
  query: vi.fn(),
  database: vi.fn(),
}));

const mockSii = vi.hoisted(() => ({
  fetchSiiResource: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  withDatabase: mockDb.database,
}));

vi.mock("@/lib/sii-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sii-client")>();
  return {
    ...actual,
    fetchSiiResource: mockSii.fetchSiiResource,
  };
});

const createSessionCookie = async (numeroControl = "ALUMNO-01") => {
  return encryptSession({
    token: "token-ficticio",
    numero_control: numeroControl,
    exp: Math.floor(Date.now() / 1000) + 1800,
    createdAt: Math.floor(Date.now() / 1000),
  });
};

const makeRequest = async (
  path: string,
  options: {
    method?: string;
    body?: unknown;
    numeroControl?: string;
    headers?: Record<string, string>;
  } = {}
) => {
  const cookie = await createSessionCookie(options.numeroControl || "ALUMNO-01");
  const headers = new Headers({
    cookie: `sii_session=${cookie}`,
    origin: base,
    "content-type": "application/json",
    ...(options.headers || {}),
  });

  return new Request(base + path, {
    method: options.method || "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
};

// Fixture de horario SII normalizado a partir de body.data
const sampleSiiSchedule = [
  {
    periodo: {
      clave_periodo: "2026-2",
      anio: 2026,
      descripcion_periodo: "Ago-Dic 2026",
    },
    horario: [
      {
        nombre_materia: "Tópicos Web",
        clave_materia: "TOP-001",
        lunes: "07:00-09:00",
        lunes_clave_salon: "A-12",
        martes: null,
        miercoles: "07:00-09:00",
        miercoles_clave_salon: "A-12",
        jueves: null,
        viernes: null,
        sabado: null,
      },
      {
        nombre_materia: "Redes",
        clave_materia: "RED-002",
        lunes: null,
        martes: "10:00-11:00",
        martes_clave_salon: null, // Sin aula asignada
        miercoles: null,
        jueves: null,
        viernes: null,
        sabado: null,
      },
    ],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SESSION_SECRET", secret);
  vi.stubEnv("ADMIN_NUMEROS_CONTROL", "ADMIN-01,ADMIN-02");

  mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
  mockDb.database.mockImplementation(async (cb) => cb({ query: mockDb.query }));
  mockSii.fetchSiiResource.mockResolvedValue(sampleSiiSchedule);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Módulo de reportes de fallas en aulas", () => {
  describe("Extensión de student-database (app.is_admin)", () => {
    it("fija app.is_admin como 'true' cuando isAdmin es true en withActorTransaction", async () => {
      await withActorTransaction("ALUMNO-01", async () => true, true);
      expect(mockDb.query.mock.calls).toEqual([
        ["BEGIN"],
        ["SELECT set_config('app.student_id', $1, true)", ["ALUMNO-01"]],
        ["SELECT set_config('app.is_admin', $1, true)", ["true"]],
        ["COMMIT"],
      ]);
    });

    it("fija app.is_admin como 'false' explícitamente cuando isAdmin es false o no se provee", async () => {
      await withActorTransaction("ALUMNO-01", async () => true);
      expect(mockDb.query.mock.calls).toEqual([
        ["BEGIN"],
        ["SELECT set_config('app.student_id', $1, true)", ["ALUMNO-01"]],
        ["SELECT set_config('app.is_admin', $1, true)", ["false"]],
        ["COMMIT"],
      ]);
    });

    it("withStudentDatabase detecta automáticamente si el alumno es admin", async () => {
      const adminReq = await makeRequest("/api/reports", {
        numeroControl: "ADMIN-01",
      });
      await withStudentDatabase(adminReq, async () => true);
      expect(mockDb.query.mock.calls).toContainEqual([
        "SELECT set_config('app.is_admin', $1, true)",
        ["true"],
      ]);

      mockDb.query.mockClear();
      const regularReq = await makeRequest("/api/reports", {
        numeroControl: "ALUMNO-01",
      });
      await withStudentDatabase(regularReq, async () => true);
      expect(mockDb.query.mock.calls).toContainEqual([
        "SELECT set_config('app.is_admin', $1, true)",
        ["false"],
      ]);
    });
  });

  describe("Sesión de usuario (es_admin)", () => {
    it("expone es_admin: true para números de control en ADMIN_NUMEROS_CONTROL", async () => {
      mockSii.fetchSiiResource.mockResolvedValueOnce({
        numero_control: "ADMIN-01",
        email: "admin@example.invalid",
        semestre: 9,
        foto: "",
      });

      const req = await makeRequest("/api/auth/session", {
        numeroControl: "ADMIN-01",
      });
      const res = await handleSession(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.es_admin).toBe(true);
    });

    it("expone es_admin: false para alumnos no administradores", async () => {
      mockSii.fetchSiiResource.mockResolvedValueOnce({
        numero_control: "ALUMNO-01",
        email: "alumno@example.invalid",
        semestre: 5,
        foto: "",
      });

      const req = await makeRequest("/api/auth/session", {
        numeroControl: "ALUMNO-01",
      });
      const res = await handleSession(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.es_admin).toBe(false);
    });
  });

  describe("Creación de reporte (POST /api/reports/create)", () => {
    it("crea un reporte exitosamente cuando la sesión existe en su horario con salón", async () => {
      // Mock para validar tipo activo
      mockDb.query.mockImplementation(async (sql) => {
        if (typeof sql === "string" && sql.includes("app.fault_types")) {
          return { rows: [{ id: 1 }] };
        }
        if (typeof sql === "string" && sql.includes("INSERT INTO app.room_reports")) {
          return {
            rows: [{ id: "11111111-1111-4111-8111-111111111111", creado_en: new Date() }],
          };
        }
        return { rows: [] };
      });

      const req = await makeRequest("/api/reports/create", {
        method: "POST",
        body: {
          clave_materia: "TOP-001",
          dia: "lunes",
          hora_inicio: "07:00",
          hora_fin: "09:00",
          tipo_id: 1,
          descripcion: "Proyector no enciende",
        },
      });

      const res = await handleCreateReport(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe("11111111-1111-4111-8111-111111111111");

      // Verificar que insertó con el salón revalidado del horario SII ("A-12")
      const insertCall = mockDb.query.mock.calls.find(
        (c) => typeof c[0] === "string" && c[0].includes("INSERT INTO app.room_reports")
      );
      expect(insertCall).toBeDefined();
      expect(insertCall![1][0]).toBe("A-12"); // Salón extraído del SII, nunca del cliente
      expect(insertCall![1][1]).toBe("TOP-001");
      expect(insertCall![1][2]).toBe("Tópicos Web");
      expect(insertCall![1][9]).toBe("ALUMNO-01");
    });

    it("desambigua correctamente entre dos periodos con misma materia/franja y aulas distintas", async () => {
      const multiPeriodSchedule = [
        {
          periodo: {
            clave_periodo: "2026-2",
            anio: 2026,
            descripcion_periodo: "Ago-Dic 2026",
          },
          horario: [
            {
              nombre_materia: "Tópicos Web",
              clave_materia: "TOP-001",
              lunes: "07:00-09:00",
              lunes_clave_salon: "A-12",
              martes: null,
              miercoles: null,
              jueves: null,
              viernes: null,
              sabado: null,
            },
          ],
        },
        {
          periodo: {
            clave_periodo: "2026-1",
            anio: 2026,
            descripcion_periodo: "Ene-Jun 2026",
          },
          horario: [
            {
              nombre_materia: "Tópicos Web",
              clave_materia: "TOP-001",
              lunes: "07:00-09:00",
              lunes_clave_salon: "B-04",
              martes: null,
              miercoles: null,
              jueves: null,
              viernes: null,
              sabado: null,
            },
          ],
        },
      ];

      mockSii.fetchSiiResource.mockResolvedValueOnce(multiPeriodSchedule);
      mockDb.query.mockImplementation(async (sql) => {
        if (typeof sql === "string" && sql.includes("app.fault_types")) {
          return { rows: [{ id: 1 }] };
        }
        if (typeof sql === "string" && sql.includes("INSERT INTO app.room_reports")) {
          return {
            rows: [{ id: "22222222-2222-4222-8222-222222222222", creado_en: new Date() }],
          };
        }
        return { rows: [] };
      });

      const req = await makeRequest("/api/reports/create", {
        method: "POST",
        body: {
          clave_materia: "TOP-001",
          dia: "lunes",
          hora_inicio: "07:00",
          hora_fin: "09:00",
          tipo_id: 1,
          descripcion: "Falla en aula de periodo anterior",
          periodo: "Ene-Jun 2026",
          salon: "B-04",
        },
      });

      const res = await handleCreateReport(req);
      expect(res.status).toBe(201);

      const insertCall = mockDb.query.mock.calls.find(
        (c) => typeof c[0] === "string" && c[0].includes("INSERT INTO app.room_reports")
      );
      expect(insertCall).toBeDefined();
      expect(insertCall![1][0]).toBe("B-04"); // Aula del periodo seleccionado derivada del SII
      expect(insertCall![1][6]).toBe("Ene-Jun 2026");
    });

    it("rechaza (422) por ambigüedad si hay múltiples periodos con la misma sesión y no se desambigua", async () => {
      const multiPeriodSchedule = [
        {
          periodo: {
            clave_periodo: "2026-2",
            anio: 2026,
            descripcion_periodo: "Ago-Dic 2026",
          },
          horario: [
            {
              nombre_materia: "Tópicos Web",
              clave_materia: "TOP-001",
              lunes: "07:00-09:00",
              lunes_clave_salon: "A-12",
              martes: null,
              miercoles: null,
              jueves: null,
              viernes: null,
              sabado: null,
            },
          ],
        },
        {
          periodo: {
            clave_periodo: "2026-1",
            anio: 2026,
            descripcion_periodo: "Ene-Jun 2026",
          },
          horario: [
            {
              nombre_materia: "Tópicos Web",
              clave_materia: "TOP-001",
              lunes: "07:00-09:00",
              lunes_clave_salon: "B-04",
              martes: null,
              miercoles: null,
              jueves: null,
              viernes: null,
              sabado: null,
            },
          ],
        },
      ];

      mockSii.fetchSiiResource.mockResolvedValueOnce(multiPeriodSchedule);
      const req = await makeRequest("/api/reports/create", {
        method: "POST",
        body: {
          clave_materia: "TOP-001",
          dia: "lunes",
          hora_inicio: "07:00",
          hora_fin: "09:00",
          tipo_id: 1,
          descripcion: "Falla sin periodo para desambiguar",
        },
      });

      const res = await handleCreateReport(req);
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.error.message).toContain("múltiples sesiones coincidentes");
    });

    it("rechaza (422) si el aula o periodo enviados no coinciden con el registro del SII", async () => {
      const req = await makeRequest("/api/reports/create", {
        method: "POST",
        body: {
          clave_materia: "TOP-001",
          dia: "lunes",
          hora_inicio: "07:00",
          hora_fin: "09:00",
          tipo_id: 1,
          descripcion: "Aula manipulada por el usuario",
          salon: "AULA-INVENTADA",
        },
      });

      const res = await handleCreateReport(req);
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.error.message).toContain("no coincide con el periodo y aula asignados");
    });

    it("rechaza (422) si la sesión enviada no está en el horario del alumno", async () => {
      const req = await makeRequest("/api/reports/create", {
        method: "POST",
        body: {
          clave_materia: "MATERIA-AJENA",
          dia: "lunes",
          hora_inicio: "07:00",
          hora_fin: "09:00",
          tipo_id: 1,
          descripcion: "Falla inventada",
        },
      });

      const res = await handleCreateReport(req);
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("VALIDATION_ERROR");
    });

    it("rechaza (422) si la sesión en el horario no tiene salón asignado", async () => {
      const req = await makeRequest("/api/reports/create", {
        method: "POST",
        body: {
          clave_materia: "RED-002",
          dia: "martes",
          hora_inicio: "10:00",
          hora_fin: "11:00",
          tipo_id: 1,
          descripcion: "Sin salón",
        },
      });

      const res = await handleCreateReport(req);
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.error.message).toContain("no tiene aula asignada");
    });

    it("rechaza (422) si el tipo de falla no está activo o no existe", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // Tipo no encontrado

      const req = await makeRequest("/api/reports/create", {
        method: "POST",
        body: {
          clave_materia: "TOP-001",
          dia: "lunes",
          hora_inicio: "07:00",
          hora_fin: "09:00",
          tipo_id: 999,
          descripcion: "Tipo inexistente",
        },
      });

      const res = await handleCreateReport(req);
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.error.message).toContain("tipo de falla");
    });

    it("rechaza (422) descripción vacía o que excede 500 caracteres", async () => {
      const reqVacia = await makeRequest("/api/reports/create", {
        method: "POST",
        body: {
          clave_materia: "TOP-001",
          dia: "lunes",
          hora_inicio: "07:00",
          hora_fin: "09:00",
          tipo_id: 1,
          descripcion: "   ",
        },
      });
      expect((await handleCreateReport(reqVacia)).status).toBe(422);

      const reqLarga = await makeRequest("/api/reports/create", {
        method: "POST",
        body: {
          clave_materia: "TOP-001",
          dia: "lunes",
          hora_inicio: "07:00",
          hora_fin: "09:00",
          tipo_id: 1,
          descripcion: "x".repeat(501),
        },
      });
      expect((await handleCreateReport(reqLarga)).status).toBe(422);
    });

    it("rechaza (409) si el alumno ya tiene un reporte abierto para la misma sesión", async () => {
      mockDb.query.mockImplementation(async (sql) => {
        if (typeof sql === "string" && sql.includes("app.fault_types")) {
          return { rows: [{ id: 1 }] };
        }
        if (
          typeof sql === "string" &&
          sql.includes("SELECT id FROM app.room_reports") &&
          sql.includes("estado IN ('recibido', 'en_revision')")
        ) {
          return { rows: [{ id: "existing-report-id" }] };
        }
        return { rows: [] };
      });

      const req = await makeRequest("/api/reports/create", {
        method: "POST",
        body: {
          clave_materia: "TOP-001",
          dia: "lunes",
          hora_inicio: "07:00",
          hora_fin: "09:00",
          tipo_id: 1,
          descripcion: "Otro proyector fallando en la misma clase",
        },
      });

      const res = await handleCreateReport(req);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("CONFLICT");
      expect(json.error.message).toContain("reporte abierto para esta misma sesión");
    });

    it("rechaza (409) ante conflicto atómico por índice único uq_room_reports_open_session_reporter", async () => {
      mockDb.query.mockImplementation(async (sql) => {
        if (typeof sql === "string" && sql.includes("app.fault_types")) {
          return { rows: [{ id: 1 }] };
        }
        if (
          typeof sql === "string" &&
          sql.includes("SELECT id FROM app.room_reports")
        ) {
          return { rows: [] }; // Pasa verificación previa
        }
        if (
          typeof sql === "string" &&
          sql.includes("INSERT INTO app.room_reports")
        ) {
          const pgError = new Error(
            'duplicate key value violates unique constraint "uq_room_reports_open_session_reporter"'
          );
          (pgError as { code?: string }).code = "23505";
          throw pgError;
        }
        return { rows: [] };
      });

      const req = await makeRequest("/api/reports/create", {
        method: "POST",
        body: {
          clave_materia: "TOP-001",
          dia: "lunes",
          hora_inicio: "07:00",
          hora_fin: "09:00",
          tipo_id: 1,
          descripcion: "Inserción concurrente simultánea",
        },
      });

      const res = await handleCreateReport(req);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("CONFLICT");
      expect(json.error.message).toContain("reporte abierto para esta misma sesión");
    });

    it("permite crear reporte si el reporte previo de la misma sesión ya está resuelto o cerrado", async () => {
      mockDb.query.mockImplementation(async (sql) => {
        if (typeof sql === "string" && sql.includes("app.fault_types")) {
          return { rows: [{ id: 1 }] };
        }
        if (
          typeof sql === "string" &&
          sql.includes("SELECT id FROM app.room_reports")
        ) {
          // El filtro estado IN ('recibido', 'en_revision') excluye resuelto/cerrado
          return { rows: [] };
        }
        if (
          typeof sql === "string" &&
          sql.includes("INSERT INTO app.room_reports")
        ) {
          return {
            rows: [
              {
                id: "22222222-2222-4222-8222-222222222222",
                creado_en: new Date(),
              },
            ],
          };
        }
        return { rows: [] };
      });

      const req = await makeRequest("/api/reports/create", {
        method: "POST",
        body: {
          clave_materia: "TOP-001",
          dia: "lunes",
          hora_inicio: "07:00",
          hora_fin: "09:00",
          tipo_id: 1,
          descripcion: "Nueva falla semanas después de haber resuelto la anterior",
        },
      });

      const res = await handleCreateReport(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe("22222222-2222-4222-8222-222222222222");
    });
  });

  describe("Lista y anonimato (GET /api/reports)", () => {
    const syntheticReports = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        salon: "A-12",
        clave_materia: "TOP-001",
        nombre_materia: "Tópicos Web",
        dia: "lunes",
        hora_inicio: "07:00",
        hora_fin: "09:00",
        periodo: "Ago-Dic 2026",
        tipo_id: 1,
        tipo_nombre: "Proyector",
        descripcion: "No enciende",
        estado: "recibido",
        prioridad: null,
        reporter_id: "ALUMNO-99", // Reportado por otro alumno
        creado_en: new Date("2026-11-05T10:00:00Z"),
        actualizado_en: new Date("2026-11-05T10:00:00Z"),
        apoyos_conteo: 2,
        lo_apoye: false,
        es_mio: false,
      },
    ];

    const syntheticEvents = [
      {
        id: "22222222-2222-4222-8222-222222222222",
        report_id: "11111111-1111-4111-8111-111111111111",
        actor_admin: "ADMIN-01",
        estado_anterior: "recibido",
        estado_nuevo: "en_revision",
        prioridad_anterior: null,
        prioridad_nueva: "alta",
        comentario: "Turnado a mantenimiento",
        creado_en: new Date("2026-11-05T11:00:00Z"),
      },
    ];

    it("anonimiza reporter_id y apoyos para alumnos no administradores", async () => {
      mockDb.query.mockImplementation(async (sql) => {
        if (
          typeof sql === "string" &&
          (sql.includes("app.v_room_reports") || sql.includes("app.room_reports"))
        ) {
          return { rows: syntheticReports };
        }
        if (
          typeof sql === "string" &&
          (sql.includes("app.v_report_events") || sql.includes("app.report_events"))
        ) {
          return { rows: syntheticEvents };
        }
        return { rows: [] };
      });

      const req = await makeRequest("/api/reports", {
        numeroControl: "ALUMNO-01",
      });
      const res = await handleListReports(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      const rep = json.data[0];

      // Crítico de anonimato:
      expect(rep.reporter_id).toBeUndefined();
      expect(rep.apoyos_estudiantes).toBeUndefined();
      expect(rep.historial[0].actor_admin).toBeUndefined();
      expect(rep.apoyos_conteo).toBe(2);
      expect(rep.es_mio).toBe(false);
    });

    it("muestra reporter_id, apoyos_estudiantes y actor_admin para administradores", async () => {
      mockDb.query.mockImplementation(async (sql) => {
        if (
          typeof sql === "string" &&
          (sql.includes("app.v_room_reports") || sql.includes("app.room_reports"))
        ) {
          return { rows: syntheticReports };
        }
        if (
          typeof sql === "string" &&
          (sql.includes("app.v_report_events") || sql.includes("app.report_events"))
        ) {
          return { rows: syntheticEvents };
        }
        if (
          typeof sql === "string" &&
          sql.includes("FROM app.report_confirmations")
        ) {
          return {
            rows: [
              {
                report_id: "11111111-1111-4111-8111-111111111111",
                student_id: "ALUMNO-50",
              },
              {
                report_id: "11111111-1111-4111-8111-111111111111",
                student_id: "ALUMNO-51",
              },
            ],
          };
        }
        return { rows: [] };
      });

      const req = await makeRequest("/api/reports", {
        numeroControl: "ADMIN-01",
      });
      const res = await handleListReports(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      const rep = json.data[0];

      expect(rep.reporter_id).toBe("ALUMNO-99");
      expect(rep.apoyos_estudiantes).toEqual(["ALUMNO-50", "ALUMNO-51"]);
      expect(rep.historial[0].actor_admin).toBe("ADMIN-01");
    });

    it("los tipos de falla inactivos siguen siendo legibles en reportes históricos con su nombre", async () => {
      const historicalReportWithInactiveType = [
        {
          id: "33333333-3333-4333-8333-333333333333",
          salon: "B-04",
          clave_materia: "TOP-001",
          nombre_materia: "Tópicos Web",
          dia: "lunes",
          hora_inicio: "07:00",
          hora_fin: "09:00",
          periodo: "Ene-Jun 2026",
          tipo_id: 99, // Tipo histórico desactivado
          tipo_nombre: "Tipo Antiguo Desactivado",
          descripcion: "Falla histórica resuelta con tipo desactivado",
          estado: "resuelto",
          prioridad: "media",
          reporter_id: "ALUMNO-99",
          creado_en: new Date("2026-03-01T10:00:00Z"),
          actualizado_en: new Date("2026-03-05T10:00:00Z"),
          apoyos_conteo: 1,
          lo_apoye: false,
          es_mio: false,
        },
      ];

      mockDb.query.mockImplementation(async (sql) => {
        if (
          typeof sql === "string" &&
          (sql.includes("app.v_room_reports") || sql.includes("app.room_reports"))
        ) {
          // El JOIN a app.fault_types o LEFT JOIN resuelve el tipo aunque esté inactivo
          return { rows: historicalReportWithInactiveType };
        }
        if (
          typeof sql === "string" &&
          (sql.includes("app.v_report_events") || sql.includes("app.report_events"))
        ) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      const req = await makeRequest("/api/reports?estado=resuelto", {
        numeroControl: "ALUMNO-01",
      });
      const res = await handleListReports(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(1);
      expect(json.data[0].id).toBe("33333333-3333-4333-8333-333333333333");
      expect(json.data[0].tipo_nombre).toBe("Tipo Antiguo Desactivado");
      expect(json.data[0].tipo_id).toBe(99);
      expect(json.data[0].estado).toBe("resuelto");
    });
  });

  describe("Apoyar reporte (POST /api/reports/confirm)", () => {
    const validReportId = "11111111-1111-4111-8111-111111111111";

    it("registra apoyo exitoso para reporte abierto ajeno", async () => {
      mockDb.query.mockImplementation(async (sql) => {
        if (typeof sql === "string" && sql.includes("SELECT id, estado, reporter_id")) {
          return {
            rows: [{ id: validReportId, estado: "recibido", reporter_id: "ALUMNO-OTRO" }],
          };
        }
        if (typeof sql === "string" && sql.includes("SELECT 1 FROM app.report_confirmations")) {
          return { rows: [] }; // No ha apoyado previamente
        }
        return { rows: [] };
      });

      const req = await makeRequest("/api/reports/confirm", {
        method: "POST",
        body: { report_id: validReportId },
        numeroControl: "ALUMNO-01",
      });

      const res = await handleConfirmReport(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      const insertCall = mockDb.query.mock.calls.find(
        (c) => typeof c[0] === "string" && c[0].includes("INSERT INTO app.report_confirmations")
      );
      expect(insertCall).toBeDefined();
      expect(insertCall![1]).toEqual([validReportId, "ALUMNO-01"]);
    });

    it("rechaza (409) si intenta apoyar su propio reporte", async () => {
      mockDb.query.mockImplementation(async (sql) => {
        if (typeof sql === "string" && sql.includes("SELECT id, estado, reporter_id")) {
          return {
            rows: [{ id: validReportId, estado: "recibido", reporter_id: "ALUMNO-01" }],
          };
        }
        return { rows: [] };
      });

      const req = await makeRequest("/api/reports/confirm", {
        method: "POST",
        body: { report_id: validReportId },
        numeroControl: "ALUMNO-01",
      });

      const res = await handleConfirmReport(req);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.message).toContain("ti mismo");
    });

    it("rechaza (409) si el reporte ya no está abierto (resuelto o cerrado)", async () => {
      mockDb.query.mockImplementation(async (sql) => {
        if (typeof sql === "string" && sql.includes("SELECT id, estado, reporter_id")) {
          return {
            rows: [{ id: validReportId, estado: "resuelto", reporter_id: "ALUMNO-OTRO" }],
          };
        }
        return { rows: [] };
      });

      const req = await makeRequest("/api/reports/confirm", {
        method: "POST",
        body: { report_id: validReportId },
      });

      const res = await handleConfirmReport(req);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.message).toContain("abiertos");
    });

    it("rechaza (409) si el alumno ya había apoyado este reporte", async () => {
      mockDb.query.mockImplementation(async (sql) => {
        if (typeof sql === "string" && sql.includes("SELECT id, estado, reporter_id")) {
          return {
            rows: [{ id: validReportId, estado: "recibido", reporter_id: "ALUMNO-OTRO" }],
          };
        }
        if (typeof sql === "string" && sql.includes("SELECT 1 FROM app.report_confirmations")) {
          return { rows: [{ 1: 1 }] }; // Ya apoyó
        }
        return { rows: [] };
      });

      const req = await makeRequest("/api/reports/confirm", {
        method: "POST",
        body: { report_id: validReportId },
      });

      const res = await handleConfirmReport(req);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.message).toContain("anteriormente");
    });
  });

  describe("Retiro de reporte (POST /api/reports/withdraw)", () => {
    const validReportId = "11111111-1111-4111-8111-111111111111";

    it("permite retirar el reporte si es del propio autor y está en 'recibido'", async () => {
      mockDb.query.mockImplementation(async (sql) => {
        if (typeof sql === "string" && sql.includes("SELECT id, estado, reporter_id")) {
          return {
            rows: [{ id: validReportId, estado: "recibido", reporter_id: "ALUMNO-01" }],
            rowCount: 1,
          };
        }
        if (typeof sql === "string" && sql.includes("DELETE FROM app.room_reports")) {
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      const req = await makeRequest("/api/reports/withdraw", {
        method: "POST",
        body: { report_id: validReportId },
        numeroControl: "ALUMNO-01",
      });

      const res = await handleWithdrawReport(req);
      expect(res.status).toBe(200);

      const deleteCall = mockDb.query.mock.calls.find(
        (c) => typeof c[0] === "string" && c[0].includes("DELETE FROM app.room_reports")
      );
      expect(deleteCall).toBeDefined();
    });

    it("rechaza (409) si ocurre carrera concurrente y el delete reporta 0 filas eliminadas", async () => {
      mockDb.query.mockImplementation(async (sql) => {
        if (typeof sql === "string" && sql.includes("SELECT id, estado, reporter_id")) {
          return {
            rows: [{ id: validReportId, estado: "recibido", reporter_id: "ALUMNO-01" }],
            rowCount: 1,
          };
        }
        if (typeof sql === "string" && sql.includes("DELETE FROM app.room_reports")) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      });

      const req = await makeRequest("/api/reports/withdraw", {
        method: "POST",
        body: { report_id: validReportId },
        numeroControl: "ALUMNO-01",
      });

      const res = await handleWithdrawReport(req);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("CONFLICT");
      expect(json.error.message).toContain("no se encuentra en estado recibido");
    });

    it("rechaza (403) si un alumno intenta retirar el reporte de otro", async () => {
      mockDb.query.mockImplementation(async (sql) => {
        if (typeof sql === "string" && sql.includes("SELECT id, estado, reporter_id")) {
          return {
            rows: [{ id: validReportId, estado: "recibido", reporter_id: "OTRO-ALUMNO" }],
          };
        }
        return { rows: [] };
      });

      const req = await makeRequest("/api/reports/withdraw", {
        method: "POST",
        body: { report_id: validReportId },
        numeroControl: "ALUMNO-01",
      });

      const res = await handleWithdrawReport(req);
      expect(res.status).toBe(403);
    });

    it("rechaza (409) si el reporte ya fue cambiado de estado (fuera de 'recibido')", async () => {
      mockDb.query.mockImplementation(async (sql) => {
        if (typeof sql === "string" && sql.includes("SELECT id, estado, reporter_id")) {
          return {
            rows: [{ id: validReportId, estado: "en_revision", reporter_id: "ALUMNO-01" }],
          };
        }
        return { rows: [] };
      });

      const req = await makeRequest("/api/reports/withdraw", {
        method: "POST",
        body: { report_id: validReportId },
        numeroControl: "ALUMNO-01",
      });

      const res = await handleWithdrawReport(req);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.message).toContain("recibido");
    });
  });

  describe("Rutas de administración y control de acceso (403)", () => {
    it.each([
      ["POST", "/api/admin/reports/update", handleAdminUpdateReport, { report_id: "11111111-1111-4111-8111-111111111111", comentario: "test" }],
      ["GET", "/api/admin/reports/summary", handleAdminReportsSummary, undefined],
      ["GET", "/api/admin/report-types", handleAdminListFaultTypes, undefined],
      ["POST", "/api/admin/report-types/save", handleAdminSaveFaultType, { nombre: "Prueba" }],
    ])("rechaza con 403 a no administradores en %s %s", async (method, path, handler, body) => {
      const req = await makeRequest(path, {
        method,
        body,
        numeroControl: "ALUMNO-REGULAR",
      });
      const res = await handler(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe("ADMIN_REQUIRED");
    });

    it("permite a un administrador actualizar estado/prioridad con evento de historial", async () => {
      const reportId = "11111111-1111-4111-8111-111111111111";
      mockDb.query.mockImplementation(async (sql) => {
        if (typeof sql === "string" && sql.includes("SELECT id, estado, prioridad")) {
          return {
            rows: [{ id: reportId, estado: "recibido", prioridad: null }],
          };
        }
        return { rows: [] };
      });

      const req = await makeRequest("/api/admin/reports/update", {
        method: "POST",
        body: {
          report_id: reportId,
          estado: "en_revision",
          prioridad: "alta",
          comentario: "Asignado a personal técnico",
        },
        numeroControl: "ADMIN-01",
      });

      const res = await handleAdminUpdateReport(req);
      expect(res.status).toBe(200);

      // Verificar que insertó evento en report_events con el actor admin
      const eventCall = mockDb.query.mock.calls.find(
        (c) => typeof c[0] === "string" && c[0].includes("INSERT INTO app.report_events")
      );
      expect(eventCall).toBeDefined();
      expect(eventCall![1][1]).toBe("ADMIN-01");
      expect(eventCall![1][3]).toBe("en_revision");
      expect(eventCall![1][5]).toBe("alta");
      expect(eventCall![1][6]).toBe("Asignado a personal técnico");
    });

    it("rechaza (409) transiciones de estado inválidas (ej. recibido -> cerrado)", async () => {
      const reportId = "11111111-1111-4111-8111-111111111111";
      mockDb.query.mockImplementation(async (sql) => {
        if (typeof sql === "string" && sql.includes("SELECT id, estado, prioridad")) {
          return {
            rows: [{ id: reportId, estado: "recibido", prioridad: null }],
          };
        }
        return { rows: [] };
      });

      const req = await makeRequest("/api/admin/reports/update", {
        method: "POST",
        body: {
          report_id: reportId,
          estado: "cerrado", // Transición prohibida desde 'recibido'
          comentario: "Salto ilegal de estado",
        },
        numeroControl: "ADMIN-01",
      });

      const res = await handleAdminUpdateReport(req);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.message).toContain("Transición de estado no permitida");
    });

    it("admin puede guardar un nuevo tipo de falla", async () => {
      const req = await makeRequest("/api/admin/report-types/save", {
        method: "POST",
        body: { nombre: "Iluminación defectuosa", activo: true },
        numeroControl: "ADMIN-01",
      });

      const res = await handleAdminSaveFaultType(req);
      expect(res.status).toBe(200);

      const insertCall = mockDb.query.mock.calls.find(
        (c) => typeof c[0] === "string" && c[0].includes("INSERT INTO app.fault_types")
      );
      expect(insertCall).toBeDefined();
      expect(insertCall![1][0]).toBe("Iluminación defectuosa");
    });

    it("admin summary reporta totales y salones frecuentes sin identidades ni métricas globales", async () => {
      mockDb.query.mockImplementation(async (sql) => {
        if (typeof sql === "string" && sql.includes("GROUP BY salon")) {
          return {
            rows: [
              { salon: "A-12", total_reportes: 6, abiertos: 4, resueltos: 2 },
              { salon: "Lab 1", total_reportes: 4, abiertos: 3, resueltos: 1 },
            ],
          };
        }
        if (typeof sql === "string" && sql.includes("GROUP BY estado")) {
          return {
            rows: [
              { estado: "recibido", conteo: 4 },
              { estado: "en_revision", conteo: 3 },
              { estado: "resuelto", conteo: 3 },
            ],
          };
        }
        if (typeof sql === "string" && sql.includes("count(*)::int AS total FROM app.room_reports")) {
          return { rows: [{ total: 10 }] };
        }
        return { rows: [] };
      });

      const req = await makeRequest("/api/admin/reports/summary", {
        numeroControl: "ADMIN-01",
      });

      const res = await handleAdminReportsSummary(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.total_reportes).toBe(10);
      expect(json.data.por_estado.recibido).toBe(4);
      expect(json.data.salones_frecuentes[0].salon).toBe("A-12");

      // Verificación estricta de ausencia de identidades y métricas globales
      expect(Object.keys(json.data).sort()).toEqual(
        ["por_estado", "salones_frecuentes", "total_reportes"].sort()
      );
      for (const item of json.data.salones_frecuentes) {
        expect(Object.keys(item).sort()).toEqual(
          ["abiertos", "resueltos", "salon", "total_reportes"].sort()
        );
      }
      expect((json.data as Record<string, unknown>).reporter_id).toBeUndefined();
      expect((json.data as Record<string, unknown>).student_id).toBeUndefined();
      expect((json.data as Record<string, unknown>).actor_admin).toBeUndefined();
      expect((json.data as Record<string, unknown>).usuarios).toBeUndefined();
      expect((json.data as Record<string, unknown>).global_metrics).toBeUndefined();
    });
  });

  describe("Catálogo de tipos de fallas (GET /api/report-types)", () => {
    it("devuelve únicamente los tipos activos para estudiantes autenticados", async () => {
      mockDb.query.mockImplementation(async (sql) => {
        if (typeof sql === "string" && sql.includes("app.fault_types")) {
          // Verifica que la consulta SQL filtre explícitamente activo = true
          expect(sql).toContain("activo = true");
          return {
            rows: [
              { id: 1, nombre: "Proyector" },
              { id: 2, nombre: "Aire acondicionado" },
            ],
          };
        }
        return { rows: [] };
      });

      const req = await makeRequest("/api/report-types");
      const res = await handleListFaultTypes(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toHaveLength(2);
      expect(json.data[0].nombre).toBe("Proyector");
    });
  });

  describe("Garantías de anonimato y consultas de datos (capa SQL simulada)", () => {
    it("handleListReports consulta app.v_room_reports, app.v_report_events y conteos agregados", async () => {
      const executedQueries: string[] = [];
      mockDb.query.mockImplementation(async (sql) => {
        if (typeof sql === "string") {
          executedQueries.push(sql);
          if (sql.includes("app.v_room_reports")) {
            return {
              rows: [
                {
                  id: "11111111-1111-4111-8111-111111111111",
                  salon: "A-12",
                  clave_materia: "TOP-001",
                  nombre_materia: "Tópicos Web",
                  dia: "lunes",
                  hora_inicio: "07:00",
                  hora_fin: "09:00",
                  periodo: "Ago-Dic 2026",
                  tipo_id: 1,
                  tipo_nombre: "Proyector",
                  descripcion: "No enciende",
                  estado: "recibido",
                  prioridad: null,
                  reporter_id: null, // Enmascarado a null por la vista para alumnos ajenos
                  es_mio: false,
                  creado_en: new Date("2026-11-05T10:00:00Z"),
                  actualizado_en: new Date("2026-11-05T10:00:00Z"),
                  apoyos_conteo: 3,
                  lo_apoye: false,
                },
              ],
            };
          }
          if (sql.includes("app.v_report_events")) {
            return {
              rows: [
                {
                  id: "22222222-2222-4222-8222-222222222222",
                  report_id: "11111111-1111-4111-8111-111111111111",
                  actor_admin: null, // Enmascarado a null por la vista para alumnos
                  estado_anterior: "recibido",
                  estado_nuevo: "en_revision",
                  prioridad_anterior: null,
                  prioridad_nueva: "alta",
                  comentario: "Turnado a soporte técnico",
                  creado_en: new Date("2026-11-05T11:00:00Z"),
                },
              ],
            };
          }
        }
        return { rows: [] };
      });

      const req = await makeRequest("/api/reports", {
        numeroControl: "ALUMNO-01",
      });
      const res = await handleListReports(req);
      expect(res.status).toBe(200);

      // Confirmar que las consultas usan las vistas seguras y conteos agregados
      const reportQuery = executedQueries.find((q) => q.includes("FROM app.v_room_reports"));
      expect(reportQuery).toBeDefined();
      expect(reportQuery).toContain("app.report_confirmation_counts");
      expect(reportQuery).toContain("COALESCE(ft.nombre, 'Tipo de falla no disponible')");

      const eventsQuery = executedQueries.find((q) => q.includes("FROM app.v_report_events"));
      expect(eventsQuery).toBeDefined();

      const json = await res.json();
      expect(json.data[0].reporter_id).toBeUndefined();
      expect(json.data[0].historial[0].actor_admin).toBeUndefined();
    });
  });
});
