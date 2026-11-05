import type {FinalCalculationDTO} from "@/types/normalizers";

export const FINAL_RULE = "promedio_4_parciales_redondeo_entero" as const;
type Evaluation = {numero_calificacion:number|null;calificacion:string|null};
type PendingReason = Exclude<FinalCalculationDTO["motivoFinal"],null>;
const pending=(motivoFinal:PendingReason):FinalCalculationDTO=>({resultadoFinal:null,estadoFinal:"pendiente",origenFinal:null,motivoFinal,reglaFinal:FINAL_RULE});

/** Regla de la aplicación aceptada por el equipo; no se presenta como dato oficial del SII. */
export function calculateFinal(evaluations:readonly Evaluation[]):FinalCalculationDTO{
 if(evaluations.some(row=>row.numero_calificacion===null||!Number.isInteger(row.numero_calificacion)||row.numero_calificacion<1||row.numero_calificacion>4))return pending("numeracion_invalida");
 if(new Set(evaluations.map(row=>row.numero_calificacion)).size!==evaluations.length)return pending("evaluaciones_duplicadas");
 if(evaluations.length!==4||evaluations.some(row=>row.calificacion===null||row.calificacion.trim()===""))return pending("parciales_incompletos");
 let sum=0n;
 for(const row of evaluations){
  const raw=row.calificacion;
  if(raw===null||raw.trim()==="")return pending("parciales_incompletos");
  // Representación decimal acotada y exacta: no parseFloat, exponentes, comas o coerciones.
  const match=/^(\d{1,3})(?:\.(\d{1,6}))?$/.exec(raw.trim());
  if(!match)return pending("calificaciones_invalidas");
  const value=BigInt(match[1])*1000000n+BigInt((match[2]??"").padEnd(6,"0"));
  if(value>100000000n)return pending("calificaciones_invalidas");
  sum+=value;
 }
 // Promedio de4, seguido de redondeo .5 hacia arriba; aritmética exacta sin error binario.
 const result=Number((sum+2000000n)/4000000n);
 return {resultadoFinal:result,estadoFinal:"calculada",origenFinal:"calculada",motivoFinal:null,reglaFinal:FINAL_RULE};
}
