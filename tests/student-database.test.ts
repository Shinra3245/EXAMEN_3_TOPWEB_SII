import {describe,it,expect,vi,beforeEach,afterEach} from "vitest";
import {withStudentDatabase,withActorTransaction} from "@/lib/student-database";
import {handleDataVerification} from "@/server/data-verification";
const mocks=vi.hoisted(()=>({query:vi.fn(),session:vi.fn(),database:vi.fn()}));
vi.mock("@/lib/db",()=>({withDatabase:mocks.database}));
vi.mock("@/lib/session",()=>({requireSession:mocks.session}));
beforeEach(()=>{vi.clearAllMocks();mocks.query.mockResolvedValue({rows:[],rowCount:0});mocks.database.mockImplementation(async cb=>cb({query:mocks.query}));mocks.session.mockResolvedValue({numero_control:"TEST-A"});});
afterEach(()=>vi.unstubAllEnvs());
describe("Contexto transaccional de estudiante",()=>{
 it("usa identidad de cookie, ignora actor del cliente y parametriza set_config",async()=>{
  const req=new Request("https://portal.invalid/api/data?actor=TEST-B",{headers:{"x-student-id":"TEST-B"}});
  await withStudentDatabase(req,async c=>{await c.query("SELECT 1");return true;});
  expect(mocks.query.mock.calls).toEqual([["BEGIN"],["SELECT set_config('app.student_id', $1, true)",["TEST-A"]],["SELECT set_config('app.is_admin', $1, true)",["false"]],["SELECT 1"],["COMMIT"]]);
 });
 it("sin sesión no abre base de datos",async()=>{
  mocks.session.mockRejectedValueOnce(new Error("sin sesión"));
  await expect(withStudentDatabase(new Request("https://portal.invalid"),async()=>true)).rejects.toThrow("sin sesión");expect(mocks.database).not.toHaveBeenCalled();
 });
 it("error de operación revierte y conserva el error",async()=>{
  const error=new Error("fallo sintético");await expect(withActorTransaction("TEST-A",async()=>{throw error;})).rejects.toBe(error);
  expect(mocks.query.mock.calls.at(-1)).toEqual(["ROLLBACK"]);expect(mocks.query.mock.calls.some(c=>c[0]==="COMMIT")).toBe(false);
 });
 it("fallo al fijar contexto también revierte",async()=>{
  mocks.query.mockImplementation(async sql=>{if(sql.startsWith("SELECT set_config"))throw new Error("contexto");return {rows:[]};});
  const operation=vi.fn();await expect(withActorTransaction("TEST-A",operation)).rejects.toThrow("contexto");expect(operation).not.toHaveBeenCalled();expect(mocks.query.mock.calls.at(-1)).toEqual(["ROLLBACK"]);
 });
 it("un actor con caracteres SQL sigue como parámetro",async()=>{
  const actor="TEST'; SELECT otra_cosa;--";await withActorTransaction(actor,async()=>true);
  expect(mocks.query.mock.calls[1]).toEqual(["SELECT set_config('app.student_id', $1, true)",[actor]]);
 });
 it.each(["","X".repeat(65)])("rechaza identidad fuera de contrato antes de abrir DB",async actor=>{
  await expect(withActorTransaction(actor,async()=>true)).rejects.toThrow("Identidad");expect(mocks.database).not.toHaveBeenCalled();
 });
 it("diagnóstico deshabilitado no abre DB",async()=>{
  vi.stubEnv("DATA_VERIFY_TOKEN","");expect((await handleDataVerification(new Request("https://portal.invalid/api/internal/data-verification",{method:"POST"}))).status).toBe(404);expect(mocks.database).not.toHaveBeenCalled();
 });
});
