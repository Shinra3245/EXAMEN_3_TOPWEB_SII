import { StudentProfileDTO } from "./normalizers";

// Payload cifrado en la cookie de sesión (AES-GCM); el token del SII no se
// expone al cliente en claro.
export interface SessionPayload {
  token: string;
  numero_control: string;
  // Se prefiere el email normalizado del SII; si falta, se conserva el ingresado.
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
