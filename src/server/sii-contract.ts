import "server-only";
import { getEnvVar } from "@/config/env";
import { requireSession } from "@/lib/session";
import { fetchSiiResource, SII_ENDPOINTS } from "@/lib/sii-client";
import { setPrivateCacheHeaders, timingSafeEqualString } from "@/lib/security";
import { toSafeErrorResponse } from "@/lib/errors";

type Field = {path:string;types:string[];arrayLengths?:number[]};
export function describeStructure(value:unknown):Field[] {
 const fields=new Map<string,Field>();
 function visit(v:unknown,path:string,depth:number){
  const type=v===null?"null":Array.isArray(v)?"array":typeof v;
  const row=fields.get(path)??{path,types:[]};if(!row.types.includes(type))row.types.push(type);
  if(Array.isArray(v))row.arrayLengths=[...new Set([...(row.arrayLengths??[]),v.length])].slice(0,8);
  fields.set(path,row);
  if(depth>=7||fields.size>=300)return;
  if(Array.isArray(v)){for(const item of v.slice(0,8))visit(item,path+"[]",depth+1);}
  else if(v&&typeof v==="object")for(const key of Object.keys(v).slice(0,64)){
   // Solo claves técnicas; nunca valores ni identificadores dinámicos.
   if(!/^[a-z][a-z0-9_]{0,63}$/i.test(key)||/token|password|cookie|secret|authorization/i.test(key))continue;
   visit((v as Record<string,unknown>)[key],path+"."+key,depth+1);
  }
 }
 visit(value,"data",0);return [...fields.values()];
}
export function scheduleFormats(value:unknown):string[] {
 const formats=new Set<string>();
 if(!Array.isArray(value))return [];
 for(const period of value.slice(0,8)){
  if(!period||!Array.isArray(period.horario))continue;
  for(const item of period.horario.slice(0,80))for(const day of ["lunes","martes","miercoles","jueves","viernes","sabado"]){
   const v=item?.[day];if(v===null){formats.add("null");continue;}if(typeof v!=="string"){formats.add("not-string");continue;}
   const s=v.trim();if(!s){formats.add("empty");continue;}
   if(/^\d{1,2}:\d{2}(?::\d{2})?\s*[-–]\s*\d{1,2}:\d{2}(?::\d{2})?$/.test(s))formats.add("clock-range");
   else if(/^\d{1,2}:\d{2}(?::\d{2})?$/.test(s))formats.add("single-clock");
   else formats.add("unconfirmed-text-format");
  }
 }
 return [...formats];
}
export async function handleSiiContract(req:Request):Promise<Response>{
 const headers=new Headers();setPrivateCacheHeaders(headers);
 const token=getEnvVar("SII_CONTRACT_TOKEN"),expiry=Number(getEnvVar("SII_CONTRACT_EXPIRES_AT"));const now=Math.floor(Date.now()/1000);
 const header=req.headers.get("authorization");const given=header?.startsWith("Bearer ")?header.slice(7):"";
 if(!token||!Number.isSafeInteger(expiry)||expiry<=now||expiry>now+1800||!timingSafeEqualString(given,token))return Response.json({success:false,error:{code:"NOT_FOUND",message:"Ruta no disponible"}},{status:404,headers});
 try{
  const session=await requireSession(req);
  const data=await Promise.all([SII_ENDPOINTS.STUDENT,SII_ENDPOINTS.GRADES,SII_ENDPOINTS.KARDEX,SII_ENDPOINTS.SCHEDULE].map(path=>fetchSiiResource(path,session.token)));
  return Response.json({success:true,data:{sampled:true,valuesIncluded:false,resources:Object.fromEntries(["student","grades","kardex","schedule"].map((name,i)=>[name,describeStructure(data[i])])),scheduleFormats:scheduleFormats(data[3])}},{headers});
 }catch(error){return toSafeErrorResponse(error,"No se completó la inspección institucional");}
}
