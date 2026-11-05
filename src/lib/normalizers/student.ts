import { UpstreamError } from "../errors";
import type { StudentProfileDTO } from "@/types/normalizers";
import { object,text,numberOrNull } from "./shared";
export function normalizeStudentProfile(raw: unknown): StudentProfileDTO {
  const value=object(raw), control=text(value.numero_control);
  if (!control || control.length>64) throw new UpstreamError(502,"INVALID_STUDENT_IDENTITY","Identidad institucional no confirmada");
  return {numero_control:control,email:text(value.email),semestre:numberOrNull(value.semestre),foto:text(value.foto)};
}
