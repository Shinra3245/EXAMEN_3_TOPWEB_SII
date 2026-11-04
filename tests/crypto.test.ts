import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  encryptSession,
  decryptSession,
  decodeJwtPayload,
  calculateSessionExpiration,
} from "@/lib/crypto";
import { ConfigurationError } from "@/lib/errors";

describe("WebCrypto AES-GCM Session Encryption & Decryption", () => {
  const originalEnv = process.env;
  const mockSecret = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"; // 32 bytes hex

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.SESSION_SECRET = mockSecret;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("cifra y descifra correctamente un payload de sesión válido", async () => {
    const payload = {
      token: "synthetic-jwt-token-abc-123",
      numero_control: "20120001",
      email: "l20120001@celaya.tecnm.mx",
      exp: Math.floor(Date.now() / 1000) + 1800,
      createdAt: Math.floor(Date.now() / 1000),
    };

    const encrypted = await encryptSession(payload);
    expect(typeof encrypted).toBe("string");
    expect(encrypted.length).toBeGreaterThan(32);
    // Verificar que el token SII nunca está en texto plano
    expect(encrypted).not.toContain("synthetic-jwt-token-abc-123");

    const decrypted = await decryptSession(encrypted);
    expect(decrypted).not.toBeNull();
    expect(decrypted?.token).toBe(payload.token);
    expect(decrypted?.numero_control).toBe(payload.numero_control);
    expect(decrypted?.email).toBe(payload.email);
    expect(decrypted?.exp).toBe(payload.exp);
  });

  it("detecta alteración (tampering) en el texto cifrado y rechaza la sesión", async () => {
    const payload = {
      token: "secret-token-sii",
      numero_control: "TEST-01",
      exp: Math.floor(Date.now() / 1000) + 1800,
      createdAt: Math.floor(Date.now() / 1000),
    };

    const encrypted = await encryptSession(payload);

    // Alterar bytes del ciphertext
    const rawBinary = atob(encrypted);
    const tamperedBinary =
      rawBinary.substring(0, 15) +
      (rawBinary.charCodeAt(15) === 65 ? "B" : "A") +
      rawBinary.substring(16);
    const tamperedBase64 = btoa(tamperedBinary);

    const result = await decryptSession(tamperedBase64);
    expect(result).toBeNull();
  });

  it("rechaza sesiones que ya han expirado", async () => {
    const expiredPayload = {
      token: "expired-token",
      numero_control: "TEST-01",
      exp: Math.floor(Date.now() / 1000) - 10, // expiró hace 10 segundos
      createdAt: Math.floor(Date.now() / 1000) - 1000,
    };

    const encrypted = await encryptSession(expiredPayload);
    const result = await decryptSession(encrypted);
    expect(result).toBeNull();
  });

  it("falla con ConfigurationError (503) si SESSION_SECRET está ausente", async () => {
    delete process.env.SESSION_SECRET;

    const payload = {
      token: "any-token",
      numero_control: "TEST-01",
      exp: Math.floor(Date.now() / 1000) + 1800,
      createdAt: Math.floor(Date.now() / 1000),
    };

    await expect(encryptSession(payload)).rejects.toThrow(ConfigurationError);
  });

  it("falla si SESSION_SECRET no cumple la longitud de 32 bytes", async () => {
    process.env.SESSION_SECRET = "demasiado-corto";

    const payload = {
      token: "any-token",
      numero_control: "TEST-01",
      exp: Math.floor(Date.now() / 1000) + 1800,
      createdAt: Math.floor(Date.now() / 1000),
    };

    await expect(encryptSession(payload)).rejects.toThrow(ConfigurationError);
  });
});

describe("JWT Payload decoding & Expiration calculation", () => {
  it("decodifica el payload JWT sin validar firma ni aceptar entrada arbitraria", () => {
    // Header ficticio: {"alg":"HS256","typ":"JWT"} -> eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9
    // Payload ficticio: {"sub":"20120001","exp":1762299999,"email":"test@celaya.tecnm.mx"}
    const headerB64 = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payloadB64 = btoa(
      JSON.stringify({
        sub: "20120001",
        exp: 1762299999,
        email: "test@celaya.tecnm.mx",
      })
    );
    const dummyJwt = `${headerB64}.${payloadB64}.fictitiousSignature`;

    const decoded = decodeJwtPayload(dummyJwt);
    expect(decoded).not.toBeNull();
    expect(decoded?.sub).toBe("20120001");
    expect(decoded?.exp).toBe(1762299999);
    expect(decoded?.email).toBe("test@celaya.tecnm.mx");
  });

  it("retorna null si el formato del token no es JWT", () => {
    expect(decodeJwtPayload("not-a-jwt")).toBeNull();
    expect(decodeJwtPayload("")).toBeNull();
  });

  it("limita la expiración al menor entre expSII y 1 hora máxima", () => {
    const now = Math.floor(Date.now() / 1000);

    // Caso 1: Token SII expira en 2 horas (7200s) -> Sesión debe limitarse a 1 hora (3600s)
    const longSiiExp = now + 7200;
    const sessionExp1 = calculateSessionExpiration(longSiiExp);
    expect(sessionExp1).toBeLessThanOrEqual(now + 3600);
    expect(sessionExp1).toBeGreaterThanOrEqual(now + 3590);

    // Caso 2: Token SII expira en 15 minutos (900s) -> Sesión debe acotarse a 900s
    const shortSiiExp = now + 900;
    const sessionExp2 = calculateSessionExpiration(shortSiiExp);
    expect(sessionExp2).toBe(shortSiiExp);

    expect(() => calculateSessionExpiration(undefined)).toThrow();
    expect(() => calculateSessionExpiration(now - 1)).toThrow();
    expect(() => calculateSessionExpiration(Number.NaN)).toThrow();
  });
});
