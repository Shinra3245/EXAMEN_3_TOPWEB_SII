import type {SchedulePeriodDTO,DiaSemana,SesionHorarioDTO} from "@/types/normalizers";
import {records,text,periodo} from "./shared";
const days:DiaSemana[]=["lunes","martes","miercoles","jueves","viernes","sabado"];
function range(value:string):{inicio:string;fin:string}|null {
 const match=/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*[-–]\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
 if(!match)return null;
 const [h1,m1,s1,h2,m2,s2]=match.slice(1).map(v=>Number(v??0));
 if(h1>23||h2>23||m1>59||m2>59||s1!==0||s2!==0||h1*60+m1>=h2*60+m2)return null;
 const clock=(h:number,m:number)=>String(h).padStart(2,"0")+":"+String(m).padStart(2,"0");
 return {inicio:clock(h1,m1),fin:clock(h2,m2)};
}
export function normalizeSchedule(raw:unknown):SchedulePeriodDTO[]{
 return records(raw).map(entry=>({periodo:periodo(entry.periodo),horario:records(entry.horario).map(item=>{
  const sesiones:SesionHorarioDTO[]=[],diasNoInterpretados:DiaSemana[]=[];
  for(const dia of days){
   const v=item[dia];if(v===null||v===undefined||v===""||(typeof v==="string"&&!v.trim()))continue;
   const times=typeof v==="string"?range(v):null;
   if(times)sesiones.push({dia,...times,salon:text(item[dia+"_clave_salon"])||null});else diasNoInterpretados.push(dia);
  }
  const day=(v:unknown)=>typeof v==="string"&&v.trim()?v:null;
  return {nombre_materia:text(item.nombre_materia),clave_materia:text(item.clave_materia),sesiones,diasNoInterpretados,lunes:day(item.lunes),martes:day(item.martes),miercoles:day(item.miercoles),jueves:day(item.jueves),viernes:day(item.viernes),sabado:day(item.sabado)};
 })}));
}
