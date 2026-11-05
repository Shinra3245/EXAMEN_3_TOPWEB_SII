import { UpstreamError } from "../errors";
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new UpstreamError(502,"INVALID_ACADEMIC_DATA","Estructura académica no reconocida");
  return value as Record<string, unknown>;
}
export function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new UpstreamError(502,"INVALID_ACADEMIC_DATA","Colección académica no reconocida");
  return value.map(object);
}
export function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
export function numberOrNull(value: unknown): number | null {
  if (typeof value === "string" && /^\d+$/.test(value.trim())) value = Number(value);
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0 ? value : null;
}
export function grade(value: unknown): string | null {
  return typeof value === "string" ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : null;
}

export function decimalOrNull(value:unknown):number|null {
 if(typeof value==="string"){
  const s=value.trim();if(!/^\d+(?:\.\d+)?$/.test(s))return null;value=Number(s);
 }
 return typeof value==="number"&&Number.isFinite(value)&&value>=0?value:null;
}
export function periodo(value:unknown):import("@/types/normalizers").PeriodoDTO|null {
 if(value===undefined||value===null)return null;
 const row=object(value);return {clave_periodo:text(row.clave_periodo),anio:numberOrNull(row.anio),descripcion_periodo:text(row.descripcion_periodo)};
}
