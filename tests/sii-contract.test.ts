import {describe,it,expect,vi,afterEach} from "vitest";
import {describeStructure,scheduleFormats,handleSiiContract} from "@/server/sii-contract";
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe("Inspección estructural privada",()=>{
 it("omite valores, tokens y claves dinámicas",()=>{
  const report=JSON.stringify(describeStructure({nombre:"PERSONA_NO_PUBLICAR",email:"privado@example.invalid",token:"TOKEN_NO_PUBLICAR",12345:{otro:"NO"},materias:[{calificacion:"99",final:null}]}));
  expect(report).toContain("data.nombre");for(const value of ["PERSONA_NO_PUBLICAR","privado@example.invalid","TOKEN_NO_PUBLICAR","12345","99"])expect(report).not.toContain(value);
 });
 it("limita profundidad y filas sin afirmar esquema exhaustivo",()=>{
  const rows=Array.from({length:20},(_,i)=>i===19?{no_observado:"privado"}:{calificacion:null});
  expect(JSON.stringify(describeStructure(rows))).not.toContain("no_observado");expect(describeStructure(rows)[0].arrayLengths).toEqual([20]);
 });
 it("clasifica formatos sin devolver horas o textos",()=>{
  expect(scheduleFormats([{horario:[{lunes:"07:00 - 08:00",martes:null,miercoles:"PERSONA_NO_PUBLICAR",jueves:"",viernes:"09:00",sabado:null}]}])).toEqual(["clock-range","null","unconfirmed-text-format","empty","single-clock"]);
 });
 it("deshabilitado no consulta red ni requiere datos personales",async()=>{
  vi.stubEnv("SII_CONTRACT_TOKEN","");const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
  const response=await handleSiiContract(new Request("https://portal.invalid/api/internal/sii-contract",{method:"POST"}));expect(response.status).toBe(404);expect(fetcher).not.toHaveBeenCalled();
 });
 it("vencido no consulta SII",async()=>{
  vi.stubEnv("SII_CONTRACT_TOKEN","test-token");vi.stubEnv("SII_CONTRACT_EXPIRES_AT","1");const f=vi.fn();vi.stubGlobal("fetch",f);
  expect((await handleSiiContract(new Request("https://portal.invalid/api/internal/sii-contract",{method:"POST",headers:{Authorization:"Bearer test-token"}}))).status).toBe(404);expect(f).not.toHaveBeenCalled();
 });
});
