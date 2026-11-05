import {describe,it,expect} from "vitest";
import {calculateFinal} from "@/lib/normalizers/final-grade";
import {normalizeGrades} from "@/lib/normalizers/grades";
import {normalizeKardex} from "@/lib/normalizers/kardex";
const evaluations=(values:(string|null)[])=>values.map((calificacion,i)=>({numero_calificacion:i+1,calificacion}));
describe("Final calculada por regla aceptada",()=>{
 it.each([
  [["80","90","70","100"],85],
  [["85","85","85","86"],85],
  [["85","85","86","86"],86],
  [["0","0","0","0"],0],
  [["100","100","100","100"],100],
  [["60","60","60","60"],60],
  [["0.1","0.1","0.1","1.7"],1],
  [["0.1","0.1","0.1","1.699996"],0],
  [[" 90.00 ","90","90","90"],90],
 ] as const)("calcula y redondea %j → %i",(values,expected)=>{
  expect(calculateFinal(evaluations([...values]))).toEqual({resultadoFinal:expected,estadoFinal:"calculada",origenFinal:"calculada",motivoFinal:null,reglaFinal:"promedio_4_parciales_redondeo_entero"});
 });
 it.each([null,""," "])("nota ausente %j no se convierte en cero",missing=>{
  expect(calculateFinal(evaluations(["90",missing,"90","90"]))).toMatchObject({resultadoFinal:null,estadoFinal:"pendiente",origenFinal:null,motivoFinal:"parciales_incompletos"});
 });
 it.each(["AC","NaN","Infinity","-1","101","100.000001","1e2","0x64","90 puntos","90,5","1.1234567"])("rechaza nota inválida %j",invalid=>{
  expect(calculateFinal(evaluations(["90",invalid,"90","90"]))).toMatchObject({resultadoFinal:null,motivoFinal:"calificaciones_invalidas"});
 });
 it.each([{values:[]},{values:["80"]},{values:["80","90"]},{values:["80","90","90"]}])("faltan parciales %j",({values})=>{
  expect(calculateFinal(evaluations(values))).toMatchObject({resultadoFinal:null,motivoFinal:"parciales_incompletos"});
 });
 it("usa numeración, no posición; no modifica evaluaciones originales",()=>{
  const rows=Object.freeze(evaluations(["80","90","70","100"]).reverse().map(r=>Object.freeze(r)));
  expect(calculateFinal(rows).resultadoFinal).toBe(85);expect(rows[0].numero_calificacion).toBe(4);
 });
 it("duplicados no simulan cuatro parciales completos",()=>{
  const rows=evaluations(["80","80","80","80"]);rows[3].numero_calificacion=3;
  expect(calculateFinal(rows)).toMatchObject({resultadoFinal:null,motivoFinal:"evaluaciones_duplicadas"});
 });
 it.each([null,0,5,1.5])("numeración no admitida %j",n=>{
  const rows:{numero_calificacion:number|null;calificacion:string|null}[]=evaluations(["80","80","80","80"]);rows[0].numero_calificacion=n;
  expect(calculateFinal(rows)).toMatchObject({resultadoFinal:null,motivoFinal:"numeracion_invalida"});
 });
 it("una quinta evaluación no se ignora",()=>expect(calculateFinal(evaluations(["80","80","80","80","80"])).resultadoFinal).toBeNull());
 it("integra con API sin sustituir final por la última y deja kardex oficial intacto",()=>{
  const grades=normalizeGrades([{materias:[{materia:{nombre_materia:"Materia sintética",clave_materia:"TEST"},calificaiones:evaluations(["80","90","70","100"])}]}]);
  expect(grades[0].materias[0].resultadoFinal).toBe(85);expect(grades[0].materias[0].origenFinal).toBe("calculada");
  expect(normalizeKardex({kardex:[{clave_materia:"TEST",calificacion:"88"}]}).kardex[0].calificacion).toBe("88");
 });
 it("la causa pendiente tiene precedencia estable pese al orden",()=>{
  const rows=[{numero_calificacion:5,calificacion:"AC"},{numero_calificacion:1,calificacion:null},{numero_calificacion:1,calificacion:"80"}];
  expect(calculateFinal(rows).motivoFinal).toBe("numeracion_invalida");expect(calculateFinal([...rows].reverse()).motivoFinal).toBe("numeracion_invalida");
 });
 it("ignora metadatos finales de entrada y genera procedencia desde los parciales",()=>{
  const out=normalizeGrades([{materias:[{materia:{nombre_materia:"Prueba",clave_materia:"TEST"},resultadoFinal:100,origenFinal:"oficial",estadoFinal:"calculada",calificaiones:evaluations(["20","20","20","20"])}]}])[0].materias[0];
  expect(out.resultadoFinal).toBe(20);expect(out.origenFinal).toBe("calculada");
 });

});
