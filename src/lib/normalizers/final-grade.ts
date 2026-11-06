import type { FinalCalculationDTO } from "@/types/normalizers";

export const FINAL_RULE = "promedio_4_parciales_redondeo_entero" as const;

type Evaluation = {
  numero_calificacion: number | null;
  calificacion: string | null;
};

type PendingReason = Exclude<FinalCalculationDTO["motivoFinal"], null>;

function pending(motivoFinal: PendingReason): FinalCalculationDTO {
  return {
    resultadoFinal: null,
    estadoFinal: "pendiente",
    origenFinal: null,
    motivoFinal,
    reglaFinal: FINAL_RULE,
  };
}

/** Regla de la aplicación; el resultado no se presenta como dato oficial del SII. */
export function calculateFinal(
  evaluations: readonly Evaluation[],
): FinalCalculationDTO {
  const hasInvalidNumber = evaluations.some(
    ({ numero_calificacion }) =>
      numero_calificacion === null ||
      !Number.isInteger(numero_calificacion) ||
      numero_calificacion < 1 ||
      numero_calificacion > 4,
  );
  if (hasInvalidNumber) return pending("numeracion_invalida");

  const numbers = evaluations.map(({ numero_calificacion }) =>
    Number(numero_calificacion),
  );
  if (new Set(numbers).size !== evaluations.length) {
    return pending("evaluaciones_duplicadas");
  }

  const hasMissingEvaluation =
    evaluations.length !== 4 ||
    evaluations.some(
      ({ calificacion }) =>
        calificacion === null || calificacion.trim() === "",
    );
  if (hasMissingEvaluation) return pending("parciales_incompletos");

  let sum = 0n;
  for (const { calificacion } of evaluations) {
    if (calificacion === null || calificacion.trim() === "") {
      return pending("parciales_incompletos");
    }

    // La representación decimal es exacta: no acepta exponentes, comas ni coerciones.
    const match = /^(\d{1,3})(?:\.(\d{1,6}))?$/.exec(calificacion.trim());
    if (!match) return pending("calificaciones_invalidas");

    const wholePart = BigInt(match[1]);
    const fractionalPart = BigInt((match[2] ?? "").padEnd(6, "0"));
    const value = wholePart * 1000000n + fractionalPart;
    if (value > 100000000n) return pending("calificaciones_invalidas");

    sum += value;
  }

  // Divide entre cuatro y redondea los .5 hacia arriba sin error binario.
  const result = Number((sum + 2000000n) / 4000000n);

  return {
    resultadoFinal: result,
    estadoFinal: "calculada",
    origenFinal: "calculada",
    motivoFinal: null,
    reglaFinal: FINAL_RULE,
  };
}
