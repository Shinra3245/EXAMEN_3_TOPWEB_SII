import "server-only";
import {getEnvVar} from "@/config/env";
import {timingSafeEqualString,setPrivateCacheHeaders} from "@/lib/security";
import {readBoundedText} from "@/lib/bounded-json";
import {withDatabase} from "@/lib/db";
import {withActorTransaction} from "@/lib/student-database";
import {AppError,toSafeErrorResponse} from "@/lib/errors";

export async function handleDataVerification(req:Request):Promise<Response>{
 const headers=new Headers();setPrivateCacheHeaders(headers);
 // La ruta responde 404 si falta token, expiración inválida, fuera de la ventana
 // (máx 30 min) o token incorrecto: no se revela que la ruta exista.
 const token=getEnvVar("DATA_VERIFY_TOKEN"), expiry=Number(getEnvVar("DATA_VERIFY_EXPIRES_AT")),now=Math.floor(Date.now()/1000);
 const auth=req.headers.get("authorization");
 if(!token||!Number.isSafeInteger(expiry)||expiry<=now||expiry>now+1800||!auth?.startsWith("Bearer ")||!timingSafeEqualString(auth.slice(7),token))return Response.json({success:false,error:{code:"NOT_FOUND",message:"Ruta no disponible"}},{status:404,headers});
 try{
  // Cuerpo acotado a 512 bytes; el JSON real no debe superar 200 caracteres.
  const body=await readBoundedText(req,512);if(body.length>200)return Response.json({success:false},{status:400,headers});
  // runId debe ser un UUID v4 en minúsculas; luego se usa como parámetro SQL.
  const input=JSON.parse(body);if(!input||!['seed','verify','cleanup'].includes(input.phase)||typeof input.runId!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.runId))return Response.json({success:false},{status:400,headers});
  const run=input.runId;
  // Verifica que el rol de conexión sea el runtime restringido (sin SUPERUSER, sin BYPASSRLS,
  // sin privilegios de DDL sobre el esquema app ni USAGE sobre app_meta).
  const privileges=await withDatabase(async c=>{
   const r=await c.query("SELECT current_user = 'examen_app_runtime' AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT has_schema_privilege(current_user, 'app', 'CREATE') AND NOT has_schema_privilege(current_user, 'app_meta', 'USAGE') AS restricted FROM pg_roles WHERE rolname=current_user");
   return r.rows[0]?.restricted===true;
  });
  if(!privileges)return Response.json({success:false,error:{code:"UNRESTRICTED_DATABASE_ROLE",message:"La conexión no usa el rol limitado"}},{status:503,headers});
  // Lee los record_id visibles para un actor dado bajo su contexto RLS.
  const own=async(actor:string)=>withActorTransaction(actor,async c=>{const r=await c.query("SELECT record_id FROM app._verification_records WHERE run_id=$1",[run]);return r.rows.map(row=>String(row.record_id));});
  if(input.phase==='seed'){
   // Inserta un registro sintético por actor (A y B) como dueños distintos.
   for(const actor of ['A','B'])await withActorTransaction('TEST-'+actor,c=>c.query("INSERT INTO app._verification_records(run_id,record_id,owner_control,payload) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",[run,actor,'TEST-'+actor,'synthetic-'+actor]));
   return Response.json({success:true,data:{restrictedRole:true,committed:true}},{headers});
  }
  if(input.phase==='cleanup'){
   // Borra los registros del run; confirma que ninguno de los dos actores los ve.
   for(const actor of ['A','B'])await withActorTransaction('TEST-'+actor,c=>c.query("DELETE FROM app._verification_records WHERE run_id=$1",[run]));
   return Response.json({success:true,data:{cleaned:(await own('TEST-A')).length===0&&(await own('TEST-B')).length===0}},{headers});
  }
  // Fase verify: prueba aislamiento cruzado (B no debe ver ni modificar filas de A),
  // bloqueo de inserción de fila ajena, y rollback transaccional.
  const a=await own('TEST-A'),b=await own('TEST-B');
  const crossUpdate=await withActorTransaction('TEST-B',c=>c.query("UPDATE app._verification_records SET payload='synthetic-B' WHERE run_id=$1 AND record_id='A'",[run]));
  const crossDelete=await withActorTransaction('TEST-B',c=>c.query("DELETE FROM app._verification_records WHERE run_id=$1 AND record_id='A'",[run]));
  let insertDenied=false;
  // Se espera un error SQLSTATE 42501 (insufficient_privilege) al intentar insertar
  // una fila cuyo owner_control es de otro actor.
  try{await withActorTransaction('TEST-B',c=>c.query("INSERT INTO app._verification_records VALUES($1,'foreign','TEST-A','synthetic-A')",[run]));}catch(error){if(error instanceof AppError&&error.errorCode==="DATABASE_42501")insertDenied=true;else throw error;}
  // Error sintético para forzar el rollback de una inserción válida.
  const rolledBack=new AppError(409,'EXPECTED_ROLLBACK','Reversión sintética solicitada');
  try{await withActorTransaction('TEST-A',async c=>{await c.query("INSERT INTO app._verification_records VALUES($1,'rollback','TEST-A','synthetic-rollback')",[run]);throw rolledBack;});}catch(error){if(error!==rolledBack)throw error;}
  const after=await own('TEST-A');
  // Sin contexto de actor (conexión sin RLS activa) no debe verse ningún registro.
  const withoutContext=await withDatabase(c=>c.query("SELECT record_id FROM app._verification_records WHERE run_id=$1",[run]));
  const data={restrictedRole:true,persistedAfterReconnect:a.includes('A')&&b.includes('B'),readIsolation:a.length===1&&a[0]==='A'&&b.length===1&&b[0]==='B',crossUpdateDenied:crossUpdate.rowCount===0,crossDeleteDenied:crossDelete.rowCount===0,crossInsertDenied:insertDenied,rollbackVerified:!after.includes('rollback'),noContextDenied:withoutContext.rowCount===0};
  return Response.json({success:Object.values(data).every(Boolean),data},{status:Object.values(data).every(Boolean)?200:503,headers});
 }catch(error){return toSafeErrorResponse(error,"No se completó la verificación de datos");}
}
