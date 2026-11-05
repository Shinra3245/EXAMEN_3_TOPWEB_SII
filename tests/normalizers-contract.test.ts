import {describe,it,expect} from "vitest";
import {normalizeGrades} from "@/lib/normalizers/grades";
import {normalizeStudentProfile} from "@/lib/normalizers/student";
import {normalizeKardex} from "@/lib/normalizers/kardex";
import {normalizeSchedule} from "@/lib/normalizers/schedule";
const periodo={clave_periodo:"TEST-2020",anio:2020,descripcion_periodo:"Periodo sintético",interno:"OMITIR"};
const schedule=(value:unknown)=>normalizeSchedule([{periodo,horario:[{nombre_materia:"Materia sintética",clave_materia:"TEST",lunes:value,lunes_clave_salon:"AULA-TEST"}]}])[0];
describe("Contrato institucional observado E10",()=>{
 it("usa clave calificaiones exacta pese a arreglo auxiliar vacío y conserva numeración",()=>{
  const out=normalizeGrades([{periodo,materias:[{materia:{nombre_materia:"Sintética",clave_materia:"TEST"},auxiliar:[],calificaiones:[{numero_calificacion:2,calificacion:"64"},{numero_calificacion:1,calificacion:null},{numero_calificacion:4,calificacion:"97"}]}]}])[0];
  expect(out.periodo).toEqual({clave_periodo:"TEST-2020",anio:2020,descripcion_periodo:"Periodo sintético"});
  expect(out.materias[0].evaluaciones).toEqual([{numero_calificacion:2,calificacion:"64"},{numero_calificacion:1,calificacion:null},{numero_calificacion:4,calificacion:"97"}]);expect(out.materias[0].resultadoFinal).toBeNull();
 });
 it("no interpreta arreglos desconocidos como notas",()=>{
  const out=normalizeGrades([{materias:[{materia:{},otras:[{calificacion:"90"}]}]}]);expect(out[0].materias[0].evaluaciones).toEqual([]);
 });
 it("mantiene cero oficial y nulos sin recalcular indicadores",()=>{
  const out=normalizeStudentProfile({numero_control:"TEST",persona:"Persona sintética",promedio_ponderado:"64.25",materias_reprobadas:"0",materias_cursadas:"",creditos_acumulados:null,percentaje_avance_cursando:0,secreto:"OMITIR"});
  expect(out.persona).toBe("Persona sintética");expect(out.indicadores.promedio_ponderado).toBe(64.25);expect(out.indicadores.materias_reprobadas).toBe(0);expect(out.indicadores.materias_cursadas).toBeNull();expect(out.indicadores.creditos_acumulados).toBeNull();expect(out.indicadores.percentaje_avance_cursando).toBe(0);expect(JSON.stringify(out)).not.toContain("OMITIR");
 });
 it.each(["NaN","Infinity","85 puntos","1,000",-1])("rechaza decimal desconocido %j",value=>{
  expect(normalizeStudentProfile({numero_control:"TEST",promedio_aritmetico:value}).indicadores.promedio_aritmetico).toBeNull();
 });
 it("incluye avance oficial sin eliminar intentos",()=>{
  const out=normalizeKardex({porcentaje_avance:12.5,kardex:[{clave_materia:"TEST",calificacion:null},{clave_materia:"TEST",calificacion:"AC"}]});expect(out.porcentaje_avance).toBe(12.5);expect(out.kardex).toHaveLength(2);
 });
 it.each(["7:05-08:00","07:05:00 – 08:00:00"," 07:05 - 08:00 "])("interpreta rango confirmado %s y salón diario",value=>{
  const out=schedule(value);expect(out.horario[0].sesiones).toEqual([{dia:"lunes",inicio:"07:05",fin:"08:00",salon:"AULA-TEST"}]);expect(out.horario[0].diasNoInterpretados).toEqual([]);expect(out.horario[0].lunes).toBe(value);
 });
 it.each(["24:00-25:00","07:60-08:00","09:00-08:00","09:00-09:00","07:00:12-08:00:00","07:00-08:00,10:00-11:00","texto inesperado"])("conserva rango no admitido %s sin inventar sesión",value=>{
  const row=schedule(value).horario[0];expect(row.sesiones).toEqual([]);expect(row.diasNoInterpretados).toEqual(["lunes"]);expect(row.lunes).toBe(value);
 });
 it("admite límite23:59 y no crea sesión desde nulo/blanco",()=>{
  expect(schedule("23:00-23:59").horario[0].sesiones).toHaveLength(1);for(const v of [null,""]){expect(schedule(v).horario[0].sesiones).toEqual([]);expect(schedule(v).horario[0].diasNoInterpretados).toEqual([]);}
 });
});
