import { describe, it, expect } from "vitest";
import {
  gradeLevel,
  matchesSubject,
  periodLabel,
} from "../src/lib/academic-presentation";
describe("academic presentation", () => {
  it("uses approved semaphore boundaries without inventing pending grades", () => {
    expect(gradeLevel(null).level).toBe("pending");
    expect(gradeLevel(0).level).toBe("red");
    expect(gradeLevel(69).level).toBe("red");
    expect(gradeLevel(70).level).toBe("yellow");
    expect(gradeLevel(89).level).toBe("yellow");
    expect(gradeLevel(90).level).toBe("green");
    expect(gradeLevel(100).level).toBe("green");
    expect(gradeLevel(NaN).level).toBe("pending");
    expect(gradeLevel(101).level).toBe("pending");
  });
  it("finds subjects by code or accents ignoring surrounding whitespace", () => {
    expect(matchesSubject("Cálculo integral", "MAT-01", " calculo ")).toBe(
      true,
    );
    expect(matchesSubject("Cálculo integral", "MAT-01", "mat-01")).toBe(true);
    expect(matchesSubject("Cálculo integral", "MAT-01", "quimica")).toBe(false);
  });
  it("labels absent period without assuming current year", () => {
    expect(periodLabel(null)).toBe("Periodo no disponible");
    expect(
      periodLabel({ clave_periodo: "A", anio: null, descripcion_periodo: "" }),
    ).toBe("A");
  });
});
