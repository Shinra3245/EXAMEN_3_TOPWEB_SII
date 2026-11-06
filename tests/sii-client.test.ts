import {describe,it,expect,vi,afterEach} from "vitest";
import {requestSii,authenticateSii,fetchSiiResource,SII_ENDPOINTS} from "@/lib/sii-client";
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json"}});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe("Contrato institucional y transporte",()=>{
 it("usa las cinco rutas verificadas, no rutas abreviadas",()=>{
  expect(SII_ENDPOINTS).toEqual({LOGIN:"/api/login",STUDENT:"/api/movil/estudiante",GRADES:"/api/movil/estudiante/calificaciones",KARDEX:"/api/movil/estudiante/kardex",SCHEDULE:"/api/movil/estudiante/horarios"});
 });
 it("rechaza GET para login antes de contactar al SII", async () => {
  const fetcher = vi.fn().mockResolvedValue(json({ message: { login: { token: "token-sintetico" } } }));
  vi.stubGlobal("fetch", fetcher);

  await expect(requestSii(SII_ENDPOINTS.LOGIN)).rejects.toMatchObject({
   errorCode: "DISALLOWED_UPSTREAM_METHOD",
   statusCode: 403,
  });
  expect(fetcher).not.toHaveBeenCalled();
 });
 it("rechaza POST para recursos académicos antes de contactar al SII", async () => {
  const fetcher = vi.fn().mockResolvedValue(json({ code: 200, flag: true, data: {} }));
  vi.stubGlobal("fetch", fetcher);

  await expect(requestSii(SII_ENDPOINTS.STUDENT, { method: "POST", body: {} })).rejects.toMatchObject({
   errorCode: "DISALLOWED_UPSTREAM_METHOD",
   statusCode: 403,
  });
  expect(fetcher).not.toHaveBeenCalled();
 });
 it("rechaza origen configurable arbitrario",async()=>{
  vi.stubEnv("SII_BASE_URL","https://otro.invalid");await expect(requestSii(SII_ENDPOINTS.STUDENT)).rejects.toThrow();
 });
 it("rechaza rutas arbitrarias incluso en el origen permitido",async()=>{
  await expect(requestSii("/api/otra-ruta")).rejects.toThrow();
 });
 it("extrae solo token confirmado y preserva contraseña literal",async()=>{
  const fetcher=vi.fn().mockResolvedValue(json({message:{login:{token:"token-sintetico"}}}));vi.stubGlobal("fetch",fetcher);
  expect(await authenticateSii("usuario@example.invalid"," con espacios ")).toEqual({token:"token-sintetico"});
  expect(fetcher.mock.calls[0][1]).toMatchObject({method:"POST",redirect:"manual",cache:"no-store"});
  expect(JSON.parse(fetcher.mock.calls[0][1].body).password).toBe(" con espacios ");
 });
 it.each([401,403,500,302])("maneja HTTP %s sin copiar cuerpo",async(status)=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(json({error:"MARCADOR_PRIVADO"},status)));
  await expect(requestSii(SII_ENDPOINTS.STUDENT)).rejects.toMatchObject({statusCode:status===500||status===302?502:status});
 });
 it("rechaza flag false aun con HTTP200",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(json({code:200,flag:false,data:null})));
  await expect(fetchSiiResource(SII_ENDPOINTS.GRADES,"sintetico")).rejects.toMatchObject({statusCode:502});
 });
 it("rechaza envoltorio incompleto",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(json({data:[]})));
  await expect(fetchSiiResource(SII_ENDPOINTS.GRADES,"sintetico")).rejects.toMatchObject({statusCode:502});
 });
 it("mantiene timeout durante lectura del cuerpo",async()=>{
  vi.stubEnv("SII_TIMEOUT_MS","10");
  vi.stubGlobal("fetch",vi.fn(async(_url,init)=>new Response(new ReadableStream({start(c){init.signal.addEventListener("abort",()=>c.error(new DOMException("abort","AbortError")));}}))));
  await expect(requestSii(SII_ENDPOINTS.STUDENT)).rejects.toMatchObject({statusCode:504});
 });
 it("limita cuerpos por bytes sin depender de content-length",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(1024*1024+1));c.close();}}))));
  await expect(requestSii(SII_ENDPOINTS.STUDENT)).rejects.toMatchObject({errorCode:"BODY_TOO_LARGE"});
 });
 it("no publica mensajes de error de red",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockRejectedValue(new Error("MARCADOR_PRIVADO")));
  await expect(authenticateSii("usuario@example.invalid","clave-ficticia")).rejects.toThrow("No fue posible contactar");
 });
});
