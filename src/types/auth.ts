import { StudentProfileDTO } from "./normalizers";

export interface SessionPayload {
  token: string;
  numero_control: string;
  email?: string;
  exp: number; // Unix timestamp en segundos
  createdAt: number;
}

export interface SessionState {
  authenticated: boolean;
  student?: StudentProfileDTO;
}

export interface LoginCredentials {
  email: string;
  password: string;
}
