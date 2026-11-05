import "server-only";
import {getEnvVar} from "@/config/env";
import {timingSafeEqualString,setPrivateCacheHeaders} from "@/lib/security";
import {withDatabase} from "@/lib/db";
import {withActorTransaction} from "@/lib/student-database";
import {toSafeErrorResponse} from "@/lib/errors";

export async function handleDataVerification(req:Request):Promise<Response>{
 const headers=new Headers();setPrivateCacheHeaders(headers);
 const token=getEnvVar("DATA_VERIFY_TOKEN"), expiry=Number(getEnvVar("DATA_VERIFY_EXPIRES_AT")),now=Math.floor(Date.now()/1000);
 const auth=req.headers.get("authorization");
 if(!token||!Number.isSafeInteger(expiry)||expiry<=now||expiry>now+1800||!auth?.startsWith("Bearer ")||!timingSafeEqualString(auth.slice(7),token))return Response.json({success:false,error:{code:"NOT_FOUND",message:"Ruta no disponible"}},{status:404,headers});
 try{
  const body=await req.text();if(body.length>200)return Response.json({success:false},{status:400,headers});
  const input=JSON.parse(body);if(!input||!['seed','verify','cleanup'].includes(input.phase)||typeof input.runId!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.runId))return Response.json({success:false},{status:400,headers});
  const run=input.runId;
  const privileges=await withDatabase(async c=>{
   const r=await c.query("SELECT current_user = 'examen_app_runtime' AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AS restricted FROM pg_roles WHERE rolname=current_user");
   return r.rows[0]?.restricted===true;
  });
  if(!privileges)return Response.json({success:false,error:{code:"UNRESTRICTED_DATABASE_ROLE",message:"La conexión no usa el rol limitado"}},{status:503,headers});
  const own=async(actor:string)=>withActorTransaction(actor,async c=>{const r=await c.query("SELECT record_id FROM app._verification_records WHERE run_id=$1",[run]);return r.rows.map(row=>String(row.record_id));});
  if(input.phase==='seed'){
   for(const actor of ['A','B'])await withActorTransaction('TEST-'+actor,c=>c.query("INSERT INTO app._verification_records(run_id,record_id,owner_control,payload) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",[run,actor,'TEST-'+actor,'synthetic-'+actor]));
   return Response.json({success:true,data:{restrictedRole:true,committed:true}},{headers});
  }
  if(input.phase==='cleanup'){
   for(const actor of ['A','B'])await withActorTransaction('TEST-'+actor,c=>c.query("DELETE FROM app._verification_records WHERE run_id=$1",[run]));
   return Response.json({success:true,data:{cleaned:(await own('TEST-A')).length===0&&(await own('TEST-B')).length===0}},{headers});
  }
  const a=await own('TEST-A'),b=await own('TEST-B');
  const crossUpdate=await withActorTransaction('TEST-B',c=>c.query("UPDATE app._verification_records SET payload='synthetic-B' WHERE run_id=$1 AND record_id='A'",[run]));
  const crossDelete=await withActorTransaction('TEST-B',c=>c.query("DELETE FROM app._verification_records WHERE run_id=$1 AND record_id='A'",[run]));
  let insertDenied=false;
  try{await withActorTransaction('TEST-B',c=>c.query("INSERT INTO app._verification_records VALUES($1,'foreign','TEST-A','synthetic-A')",[run]));}catch{insertDenied=true;}
  const rolledBack=Symbol('rollback');
  try{await withActorTransaction('TEST-A',async c=>{await c.query("INSERT INTO app._verification_records VALUES($1,'rollback','TEST-A','synthetic-rollback')",[run]);throw rolledBack;});}catch{/* luego comprobar ausencia real */}
  const after=await own('TEST-A');
  const withoutContext=await withDatabase(c=>c.query("SELECT record_id FROM app._verification_records WHERE run_id=$1",[run]));
  const data={restrictedRole:true,persistedAfterReconnect:a.includes('A')&&b.includes('B'),readIsolation:a.length===1&&a[0]==='A'&&b.length===1&&b[0]==='B',crossUpdateDenied:crossUpdate.rowCount===0,crossDeleteDenied:crossDelete.rowCount===0,crossInsertDenied:insertDenied,rollbackVerified:!after.includes('rollback'),noContextDenied:withoutContext.rowCount===0};
  return Response.json({success:Object.values(data).every(Boolean),data},{status:Object.values(data).every(Boolean)?200:503,headers});
 }catch(error){return toSafeErrorResponse(error,"No se completó la verificación de datos");}
}
