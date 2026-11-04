import {describe,it,expect,vi,beforeEach,afterEach} from "vitest";
import {NextRequest} from "next/server";
import {POST as login} from "@/app/api/auth/login/route";
import {POST as logout} from "@/app/api/auth/logout/route";
import {GET as session} from "@/app/api/auth/session/route";
import {GET as student} from "@/app/api/student/route";
import {GET as grades} from "@/app/api/grades/route";
import {GET as kardex} from "@/app/api/kardex/route";
import {GET as schedule} from "@/app/api/schedule/route";
import {GET as health} from "@/app/api/health/route";
import {encryptSession} from "@/lib/crypto";
const base="https://portal.example.invalid";
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json"}});
const credentials={email:"alumno@example.invalid",password:" clave-ficticia "};
const profile={numero_control:"TEST-01",email:"alumno@example.invalid",semestre:5,foto:"",dato_desconocido:"NO_PUBLICAR"};
const jwt=()=>`e30.${btoa(JSON.stringify({exp:Math.floor(Date.now()/1000)+1800}))}.firma-ficticia`;
const post=(path:string,body:unknown,headers:Record<string,string>={origin:base})=>new NextRequest(base+path,{method:"POST",headers:{"content-type":"application/json",...headers},body:JSON.stringify(body)});
const cookie=()=>encryptSession({token:"token-ficticio",numero_control:"TEST-01",exp:Math.floor(Date.now()/1000)+1800,createdAt:Math.floor(Date.now()/1000)});
beforeEach(()=>{vi.stubEnv("SESSION_SECRET","ab".repeat(32));});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe("Rutas propias y aislamiento",()=>{
 it("health responde sin consultar SII",async()=>{const f=vi.fn();vi.stubGlobal("fetch",f);expect((await health()).status).toBe(200);expect(f).not.toHaveBeenCalled();});
 it("rechaza origen ausente",async()=>{expect((await login(post("/api/auth/login",credentials,{}))).status).toBe(403);});
 it("rechaza origen remoto aun con forwarded host falsificado",async()=>{
  expect((await login(post("/api/auth/login",credentials,{origin:"https://ataque.invalid","x-forwarded-host":"ataque.invalid","x-forwarded-proto":"https"}))).status).toBe(403);
 });
 it("valida configuración antes de enviar credenciales al SII",async()=>{
  vi.stubEnv("SESSION_SECRET","");const f=vi.fn();vi.stubGlobal("fetch",f);
  expect((await login(post("/api/auth/login",credentials))).status).toBe(503);expect(f).not.toHaveBeenCalled();
 });
 it.each([null,[],{}, {email:4,password:[]},{email:"",password:""}])("rechaza cuerpo inválido %j",async body=>{
  const f=vi.fn();vi.stubGlobal("fetch",f);expect((await login(post("/api/auth/login",body))).status).toBe(400);expect(f).not.toHaveBeenCalled();
 });
 it("rechaza petición sobredimensionada antes del upstream",async()=>{
  const f=vi.fn();vi.stubGlobal("fetch",f);expect((await login(post("/api/auth/login",{...credentials,password:"x".repeat(20000)}))).status).toBe(400);expect(f).not.toHaveBeenCalled();
 });
 it("login real de protocolo: no revela token/campos desconocidos y conserva espacios",async()=>{
  const token=jwt();const f=vi.fn().mockResolvedValueOnce(json({message:{login:{token}}})).mockResolvedValueOnce(json({code:200,flag:true,data:profile}));vi.stubGlobal("fetch",f);
  const response=await login(post("/api/auth/login",credentials));expect(response.status).toBe(200);
  expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/);expect(response.headers.get("set-cookie")).toMatch(/Secure/);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const data=JSON.stringify(await response.json());expect(data).not.toContain(token);expect(data).not.toContain("NO_PUBLICAR");
  expect(JSON.parse(f.mock.calls[0][1].body).password).toBe(credentials.password);
 });
 it("no genera sesión si el perfil no confirma identidad",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(json({message:{login:{token:jwt()}}})).mockResolvedValueOnce(json({code:200,flag:true,data:{}})));
  const response=await login(post("/api/auth/login",credentials));expect(response.status).toBe(502);expect(response.headers.get("set-cookie")).toBeNull();
 });
 it("no prolonga un JWT vencido aunque el upstream lo entregue",async()=>{
  const token=`e30.${btoa(JSON.stringify({exp:1}))}.ficticia`;
  vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(json({message:{login:{token}}})).mockResolvedValueOnce(json({code:200,flag:true,data:profile})));
  const response=await login(post("/api/auth/login",credentials));expect(response.status).toBe(401);expect(response.headers.get("set-cookie")).toBeNull();
 });
 it.each([session,student,grades,kardex,schedule])("protege recursos sin cookie",async handler=>{
  const response=await handler(new NextRequest(base+"/api/student"));expect(response.status).toBe(401);expect(response.headers.get("cache-control")).toContain("no-store");
 });
 it("rechaza cookie alterada",async()=>{const value=await cookie();expect((await session(new NextRequest(base+"/api/auth/session",{headers:{cookie:`sii_session=${value.slice(0,10)}AAAA${value.slice(14)}`}}))).status).toBe(401);});
 it("falta de secreto al leer cookie retorna503 y no es sesión inválida",async()=>{
  const value=await cookie();vi.stubEnv("SESSION_SECRET","");expect((await student(new NextRequest(base+"/api/student",{headers:{cookie:`sii_session=${value}`}}))).status).toBe(503);
 });
 it.each([
  [student,"/api/movil/estudiante",profile],
  [grades,"/api/movil/estudiante/calificaciones",[]],
  [kardex,"/api/movil/estudiante/kardex",{kardex:[]}],
  [schedule,"/api/movil/estudiante/horarios",[]],
 ] as const)("cada recurso usa su ruta institucional verificada",async(handler,path,data)=>{
  const value=await cookie();const f=vi.fn().mockResolvedValue(json({code:200,flag:true,data}));vi.stubGlobal("fetch",f);
  const response=await handler(new NextRequest(base+"/api/student",{headers:{cookie:`sii_session=${value}`}}));expect(response.status).toBe(200);
  expect(String(f.mock.calls[0][0])).toBe("https://sii.celaya.tecnm.mx"+path);expect(f.mock.calls[0][1].headers.Authorization).toBe("Bearer token-ficticio");
 });
 it("logout limpia cookie y rechaza origen remoto",async()=>{
  expect((await logout(post("/api/auth/logout",{}, {origin:"https://otro.invalid"}))).status).toBe(403);
  const response=await logout(post("/api/auth/logout",{}));expect(response.status).toBe(200);expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
 });
 it("rechaza cookie demasiado grande sin emitir Set-Cookie",async()=>{
  const token=`e30.${btoa(JSON.stringify({exp:Math.floor(Date.now()/1000)+1800,padding:"x".repeat(2100)}))}.firma`;
  vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(json({message:{login:{token}}})).mockResolvedValueOnce(json({code:200,flag:true,data:profile})));
  const response=await login(post("/api/auth/login",credentials));expect(response.status).toBe(502);expect(response.headers.get("set-cookie")).toBeNull();
 });
 it.each([student,session])("rechaza perfil con identidad distinta a la cookie",async handler=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(json({code:200,flag:true,data:{...profile,numero_control:"OTRO-ALUMNO"}})));
  const response=await handler(new NextRequest(base+"/api/student",{headers:{cookie:`sii_session=${await cookie()}`}}));
  expect(response.status).toBe(401);expect(JSON.stringify(await response.json())).not.toContain("OTRO-ALUMNO");
 });
 it("dos sesiones concurrentes mantienen tokens e identidades separados",async()=>{
  const f=vi.fn(async(_url:unknown,options:{headers:{Authorization:string}})=>{
   const id=options.headers.Authorization==="Bearer token-A"?"TEST-A":"TEST-B";
   return json({code:200,flag:true,data:{...profile,numero_control:id}});
  });vi.stubGlobal("fetch",f);
  const responses=await Promise.all(["A","B"].map(async id=>{
   const value=await encryptSession({token:`token-${id}`,numero_control:`TEST-${id}`,exp:Math.floor(Date.now()/1000)+1800,createdAt:Math.floor(Date.now()/1000)});
   return student(new NextRequest(base+"/api/student",{headers:{cookie:`sii_session=${value}`}}));
  }));
  const bodies=await Promise.all(responses.map(r=>r.json()));expect(bodies[0].data.numero_control).toBe("TEST-A");expect(bodies[1].data.numero_control).toBe("TEST-B");
 });

});
