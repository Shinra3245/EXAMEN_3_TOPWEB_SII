import assert from "node:assert/strict";

const origin = new URL(process.env.APP_BASE_URL ?? "http://localhost:3000").origin;
const results = [];
const cases = [
  ["home", "/", "GET", undefined, {}, 200],
  ["health", "/api/health", "GET", undefined, {}, 200],
  ...["/api/auth/session", "/api/student", "/api/student/photo", "/api/grades", "/api/kardex", "/api/schedule"]
    .map(path => ["no-session", path, "GET", undefined, {}, 401]),
  ["tampered-cookie", "/api/student", "GET", undefined, { Cookie: "sii_session=ficticia" }, 401],
  ["empty-login", "/api/auth/login", "POST", "{}", { Origin: origin }, 400],
  ["null-login", "/api/auth/login", "POST", "null", { Origin: origin }, 400],
  ["no-origin", "/api/auth/login", "POST", "{}", {}, 403],
  ["forged-proxy", "/api/auth/login", "POST", "{}", { Origin: "https://ataque.invalid", "X-Forwarded-Host": "ataque.invalid", "X-Forwarded-Proto": "https" }, 403],
  ["cross-logout", "/api/auth/logout", "POST", "{}", { Origin: "https://ataque.invalid" }, 403],
  ["logout", "/api/auth/logout", "POST", "{}", { Origin: origin }, 200],
  ["unknown-api", "/api/desconocida", "GET", undefined, {}, 404],
  ["method-not-allowed", "/api/health", "POST", "{}", {}, 405],
];
for (const [name, path, method, body, headers, expected] of cases) {
  const response = await fetch(origin + path, {
    method, body, redirect: "error", signal: AbortSignal.timeout(20000),
    headers: { "User-Agent": "ExamenSII-Validation/0.1", "Content-Type": "application/json", ...headers },
  });
  assert.equal(response.status, expected, `${name} ${path}: estado inesperado`);
  const noStore = response.headers.get("cache-control")?.includes("no-store") ?? false;
  let errorCode;
  if (path.startsWith("/api/")) {
    assert.equal(noStore, true, `${name}: falta no-store`);
    const data = await response.json();
    if (expected >= 400) {
      assert.equal(data.success, false);
      assert.equal(typeof data.error?.code, "string");
      errorCode = data.error.code;
      assert.equal(response.headers.has("set-cookie"), false);
    } else if (name === "health") {
      assert.equal(data.status, "ok");
      assert.equal(data.service, "sii-cloudflare-backend");
    }
  } else {
    assert.match(await response.text(), /Portal académico/);
  }
  if (name === "logout") {
    const cookie = response.headers.get("set-cookie") ?? "";
    for (const attribute of ["Max-Age=0", "HttpOnly", "SameSite=Lax", ...(origin.startsWith("https:") ? ["Secure"] : [])]) assert.ok(cookie.includes(attribute));
  }
  results.push({ name, path, status: response.status, noStore, errorCode, passed: true });
}
// Únicamente metadatos de pruebas sin sesión real; no imprime cuerpos, cookies o cabeceras.
console.log(JSON.stringify({ at: new Date().toISOString(), origin, authenticatedStudentFlow: false, databaseTested: false, cases: results }, null, 2));
