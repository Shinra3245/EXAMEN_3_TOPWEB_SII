import { describe, it, expect } from "vitest";
import { normalizeStudentProfile } from "@/lib/normalizers/student";
import { normalizeKardex } from "@/lib/normalizers/kardex";
import { normalizeGrades } from "@/lib/normalizers/grades";
import { normalizeSchedule } from "@/lib/normalizers/schedule";

describe("Normalizador de Perfil de Estudiante", () => {
  it("extrae estrictamente los campos observados sin inventar nombre o carrera", () => {
    const rawStudent = {
      numero_control: "20120123",
      email: "l20120123@celaya.tecnm.mx",
      semestre: 6,
      foto: "https://sii.celaya.tecnm.mx/fotos/20120123.jpg",
      extra_desconocido_1: "valor_ficticio",
      rol_interno: "ALUMNO",
    };

    const normalized = normalizeStudentProfile(rawStudent);

    expect(normalized.numero_control).toBe("20120123");
    expect(normalized.email).toBe("l20120123@celaya.tecnm.mx");
    expect(normalized.semestre).toBe(6);
    expect(normalized.foto).toBe("https://sii.celaya.tecnm.mx/fotos/20120123.jpg");

    // No debe existir propiedad nombre o carrera inventada en la raíz del DTO
    expect((normalized as unknown as Record<string, unknown>).nombre).toBeUndefined();
    expect((normalized as unknown as Record<string, unknown>).carrera).toBeUndefined();

    expect(normalized).not.toHaveProperty("unknown");
    expect(JSON.stringify(normalized)).not.toContain("valor_ficticio");
  });

  it("maneja semestre como cadena convirtiéndolo a número", () => {
    const raw = {
      numero_control: "20120456",
      email: "test@celaya.tecnm.mx",
      semestre: "8",
      foto: "foto.png",
    };

    const normalized = normalizeStudentProfile(raw);
    expect(normalized.semestre).toBe(8);
  });
});

describe("Normalizador de Kardex", () => {
  it("preserva calificaciones nulas estrictamente sin convertirlas a 0 o '0'", () => {
    const rawKardex = {
      kardex: [
        {
          nombre_materia: "CÁLCULO DIFERENCIAL",
          clave_materia: "ACF0901",
          periodo: "ENE-JUN 2024",
          creditos: "5",
          calificacion: null, // Materia en curso o no acreditada sin nota
          descripcion: "ORDINARIO",
          semestre: 1,
        },
      ],
    };

    const normalized = normalizeKardex(rawKardex);
    expect(normalized.kardex).toHaveLength(1);
    expect(normalized.kardex[0].calificacion).toBeNull();
    expect(normalized.kardex[0].calificacion).not.toBe(0);
    expect(normalized.kardex[0].calificacion).not.toBe("0");
  });

  it("preserva intentos múltiples de una misma materia sin deduplicar", () => {
    const rawKardex = [
      {
        nombre_materia: "PROGRAMACIÓN ORIENTADA A OBJETOS",
        clave_materia: "SCD1020",
        periodo: "ENE-JUN 2023",
        creditos: "5",
        calificacion: "50",
        descripcion: "REPETICIÓN",
        semestre: 2,
      },
      {
        nombre_materia: "PROGRAMACIÓN ORIENTADA A OBJETOS",
        clave_materia: "SCD1020",
        periodo: "AGO-DIC 2023",
        creditos: "5",
        calificacion: "85",
        descripcion: "REGULARIZACIÓN",
        semestre: 3,
      },
    ];

    const normalized = normalizeKardex(rawKardex);
    // Debe preservar ambos intentos
    expect(normalized.kardex).toHaveLength(2);
    expect(normalized.kardex[0].calificacion).toBe("50");
    expect(normalized.kardex[1].calificacion).toBe("85");
    expect(normalized.kardex[0].periodo).toBe("ENE-JUN 2023");
    expect(normalized.kardex[1].periodo).toBe("AGO-DIC 2023");
  });

  it("preserva calificaciones como string tal como vienen del upstream", () => {
    const rawKardex = {
      kardex: [
        {
          nombre_materia: "TUTORÍA",
          clave_materia: "TUT0001",
          periodo: "ENE-JUN 2024",
          creditos: "0",
          calificacion: "AC", // Calificación cualitativa (Acreditada)
          descripcion: "ORDINARIO",
          semestre: 1,
        },
      ],
    };

    const normalized = normalizeKardex(rawKardex);
    expect(normalized.kardex[0].calificacion).toBe("AC");
  });
});

describe("Normalizador de Calificaciones", () => {
  it("mapea materias incompletas y mantiene final pendiente", () => {
    const rawGrades = [
      {
        periodo: {
          id_periodo_desconocido: 1234,
          etiqueta_periodo: "AGOSTO-DICIEMBRE 2024",
        },
        materias: [
          {
            materia: {
              nombre_materia: "REDES DE COMPUTADORAS",
              clave_materia: "SCD1021",
              extra_materia: "datos_internos",
            },
            calificaiones: [
              { unidad: 1, calificacion: "80" },
              { unidad: 2, calificacion: "90" },
              { unidad: 3, calificacion: null },
            ],
          },
        ],
      },
    ];

    const normalized = normalizeGrades(rawGrades);
    expect(normalized).toHaveLength(1);

    const periodo = normalized[0];
    expect(periodo.materias).toHaveLength(1);

    const mat = periodo.materias[0];
    expect(mat.nombre_materia).toBe("REDES DE COMPUTADORAS");
    expect(mat.clave_materia).toBe("SCD1021");

    // En este caso incompleto no se calcula una final
    expect(mat.resultadoFinal).toBeNull();
    // No promediar los parciales disponibles ni tomar la última evaluación
    expect(mat.evaluaciones).toBeDefined();
  });
});

describe("Normalizador de Horarios", () => {
  it("conserva los días en formato raw string sin inventar analizadores de horas, aula o docente", () => {
    const rawSchedule = [
      {
        periodo: {
          periodo_desc: "2024-2",
        },
        horario: [
          {
            nombre_materia: "SISTEMAS OPERATIVOS",
            clave_materia: "SCA1026",
            lunes: "07:00-09:00",
            martes: null,
            miercoles: "07:00-09:00",
            jueves: null,
            viernes: "08:00-09:00",
            sabado: null,
            aula_desconocida: "LAB-4",
            maestro_desconocido: "DOCENTE 123",
          },
        ],
      },
    ];

    const normalized = normalizeSchedule(rawSchedule);
    expect(normalized).toHaveLength(1);

    const item = normalized[0].horario[0];
    expect(item.nombre_materia).toBe("SISTEMAS OPERATIVOS");
    expect(item.clave_materia).toBe("SCA1026");
    expect(item.lunes).toBe("07:00-09:00");
    expect(item.martes).toBeNull();
    expect(item.miercoles).toBe("07:00-09:00");
    expect(item.jueves).toBeNull();
    expect(item.viernes).toBe("08:00-09:00");
    expect(item.sabado).toBeNull();

    // No debe inventar propiedades como hora_inicio, hora_fin, aula, maestro
    expect((item as unknown as Record<string, unknown>).hora_inicio).toBeUndefined();
    expect((item as unknown as Record<string, unknown>).aula).toBeUndefined();
    expect((item as unknown as Record<string, unknown>).maestro).toBeUndefined();
  });
});

describe("Fronteras de datos no confirmados",()=>{
 it("no expone periodos o datos desconocidos en evaluaciones",()=>{
  const result=normalizeGrades([{periodo:{secreto:"NO_PUBLICAR"},materias:[{materia:{nombre_materia:"Materia",clave_materia:"M1"},calificaiones:[{numero_calificacion:1,calificacion:null,secreto:"NO_PUBLICAR"}]}]}]);
  expect(JSON.stringify(result)).not.toContain("NO_PUBLICAR");expect(result[0].periodo).toEqual({clave_periodo:"",anio:null,descripcion_periodo:""});expect(result[0].materias[0].evaluaciones).toEqual([{numero_calificacion:1,calificacion:null}]);
 });
 it("no transforma semestre desconocido en cero",()=>{
  expect(normalizeStudentProfile({numero_control:"TEST"}).semestre).toBeNull();
 });
 it("no simula una colección vacía si cambió el contrato",()=>{
  expect(()=>normalizeGrades({resultado:"otro contrato"})).toThrow();
  expect(()=>normalizeSchedule(null)).toThrow();
  expect(()=>normalizeKardex({})).toThrow();
 });
});
