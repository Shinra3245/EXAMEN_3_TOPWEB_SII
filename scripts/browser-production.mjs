// Remote runtime verification only. No web server, tracing, screenshots or private response output.
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
const base = new URL(
  process.env.APP_BASE_URL ?? "https://examen3-sii.shinra3245.workers.dev",
);
if (
  base.protocol !== "https:" ||
  ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
)
  throw new Error("A public HTTPS APP_BASE_URL is required");
const results = [];
let browser;
let context;
let current = "launch";
let failed = false;
const externalOrigins = new Set();
const pageErrors = [];
const privateHeaders = [];
async function check(name, task) {
  current = name;
  await task();
  results.push({ name, passed: true });
}
function assert(value) {
  if (!value) throw new Error("Check failed");
}
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith("http") && u.origin !== base.origin)
      externalOrigins.add(u.origin);
  });
  page.on("pageerror", () => pageErrors.push(true));
  page.on("response", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/") && r.status() === 200)
      privateHeaders.push(
        r.headers()["cache-control"]?.includes("no-store") ?? false,
      );
  });
  await check("protected-direct-access", async () => {
    await page.goto(base.origin + "/kardex");
    await page.waitForURL("**/login");
    await page.locator('input[type="email"]').waitFor();
  });
  await check("required-login-fields", async () => {
    assert(
      (await page.locator('input[type="email"]').getAttribute("required")) !==
        null,
    );
    assert(
      (await page
        .locator('input[type="password"]')
        .getAttribute("required")) !== null,
    );
  });
  if (process.argv.includes("--keyring-sii")) {
    let credentials;
    await check("authorized-keyring-read", async () => {
      credentials = JSON.parse(
        execFileSync(
          "secret-tool",
          [
            "lookup",
            "application",
            "codex-examen-sii",
            "project",
            "examen3-sii-itc",
          ],
          { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
        ),
      );
      assert(
        typeof credentials.email === "string" &&
          typeof credentials.password === "string",
      );
    });
    await check("real-sii-login-form", async () => {
      await page
        .locator('input[type="email"]')
        .fill(credentials.email, { timeout: 5000 });
      await page
        .locator('input[type="password"]')
        .fill(credentials.password, { timeout: 5000 });
      credentials = null;
      await page.getByRole("button", { name: /iniciar sesi[oó]n/i }).click();
      await page.waitForURL("**/dashboard", { timeout: 45000 });
      await page
        .getByRole("heading", { name: "Perfil del estudiante", exact: true })
        .waitFor();
    });
    await check("private-cookie", async () => {
      const cookie = (await context.cookies()).find(
        (c) => c.name === "sii_session",
      );
      assert(cookie?.httpOnly && cookie.secure && cookie.sameSite === "Lax");
      assert(
        await page.evaluate(
          () => !localStorage.length && !sessionStorage.length,
        ),
      );
    });
    await check("dashboard-real-profile", async () => {
      assert((await page.locator("main dl dd").count()) > 3);
      assert(
        (await page.locator('img[src^="/api/student/photo"]').count()) === 1 ||
          (await page
            .getByText("Fotografía no disponible.", { exact: true })
            .count()) === 1,
      );
    });
    await check("grades-error-and-real-retry", async () => {
      let aborted = false;
      await page.route("**/api/grades", async (route) => {
        if (!aborted) {
          aborted = true;
          await route.abort("failed");
        } else await route.continue();
      });
      await page.locator('a[href="/calificaciones"]').first().click();
      await page.getByRole("button", { name: "Reintentar consulta" }).waitFor();
      await page.getByRole("button", { name: "Reintentar consulta" }).click();
      await page.getByRole("table").waitFor({ timeout: 35000 });
      await page.unroute("**/api/grades");
    });
    for (const [path, heading] of [
      ["calificaciones", "Calificaciones"],
      ["kardex", "Kardex"],
      ["horario", "Horario"],
    ]) {
      await check(`${path}-real-view-and-filters`, async () => {
        if (!page.url().endsWith("/" + path))
          await page.locator(`a[href="/${path}"]`).first().click();
        await page
          .getByRole("heading", { name: heading, exact: true })
          .waitFor();
        await page
          .getByRole("button", {
            name: `Actualizar ${heading.toLocaleLowerCase("es")}`,
          })
          .waitFor({ state: "visible" });
        await page
          .locator("table tbody tr")
          .first()
          .waitFor({ timeout: 35000 });
        const count = await page.locator("table tbody tr").count();
        assert(count > 0);
        const search = page.getByRole("searchbox");
        if (await search.count()) {
          await search.fill("NO_COINCIDENCIA_SINTETICA_90875");
          assert((await page.locator("table tbody tr").count()) === 0);
          await page.getByRole("button", { name: "Limpiar filtros" }).click();
          assert((await page.locator("table tbody tr").count()) === count);
        }
        const select = page.getByLabel("Periodo", { exact: true });
        const options = select.locator("option");
        if ((await options.count()) > 1) {
          await select.selectOption({ index: 1 });
          assert((await page.locator("table tbody tr").count()) > 0);
          await page.getByRole("button", { name: "Limpiar filtros" }).click();
        }
      });
    }
    await check("private-route-reload", async () => {
      await page.reload();
      await page
        .getByRole("heading", { name: "Horario", exact: true })
        .waitFor();
      await page.locator("table tbody tr").first().waitFor({ timeout: 35000 });
    });
    await check("mobile-layout", async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      );
      const menu = page.getByRole("button", {
        name: "Alternar menú de navegación",
      });
      await menu.click();
      assert((await menu.getAttribute("aria-expanded")) === "true");
      await page
        .getByRole("navigation", { name: "Navegación móvil" })
        .waitFor();
      await menu.click();
    });
    await check("server-rejected-session-clears-ui", async () => {
      await context.addCookies([
        {
          name: "sii_session",
          value: "synthetic-invalid",
          domain: base.hostname,
          path: "/",
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
        },
      ]);
      await page.getByRole("button", { name: "Actualizar horario" }).click();
      await page.waitForURL("**/login");
      assert((await page.locator("table tbody tr").count()) === 0);
    });
    await check("real-login-then-logout", async () => {
      await page.setViewportSize({ width: 1366, height: 900 });
      let c = JSON.parse(
        execFileSync(
          "secret-tool",
          [
            "lookup",
            "application",
            "codex-examen-sii",
            "project",
            "examen3-sii-itc",
          ],
          { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
        ),
      );
      await page.locator('input[type="email"]').fill(c.email);
      await page.locator('input[type="password"]').fill(c.password);
      c = null;
      await page.getByRole("button", { name: /iniciar sesi[oó]n/i }).click();
      await page.waitForURL("**/dashboard", { timeout: 45000 });
      let blocked = false;
      await page.route("**/api/auth/logout", async (route) => {
        if (!blocked) {
          blocked = true;
          await route.abort("failed");
        } else await route.continue();
      });
      await page.getByRole("button", { name: /cerrar sesi[oó]n/i }).click();
      await page
        .getByRole("button", { name: "Reintentar cierre de sesión" })
        .waitFor();
      assert(page.url().endsWith("/dashboard"));
      await page
        .getByRole("button", { name: "Reintentar cierre de sesión" })
        .click();
      await page.waitForURL("**/login");
      await page.unroute("**/api/auth/logout");
      assert(!(await context.cookies()).some((c) => c.name === "sii_session"));
    });
  }
  await check("same-origin-browser-network", async () =>
    assert(externalOrigins.size === 0),
  );
  await check("private-api-no-store", async () =>
    assert(privateHeaders.every(Boolean)),
  );
  await check("no-browser-runtime-errors", async () =>
    assert(pageErrors.length === 0),
  );
} catch {
  failed = true;
  results.push({ name: current, passed: false });
} finally {
  if (context) {
    try {
      await context.request.post(base.origin + "/api/auth/logout", {
        headers: { Origin: base.origin },
      });
    } catch {}
  }
  await browser?.close();
}
console.log(
  JSON.stringify(
    {
      at: new Date().toISOString(),
      origin: base.origin,
      publicRuntime: true,
      authenticated: process.argv.includes("--keyring-sii"),
      isolatedFaultInjection:
        "browser grades/logout requests aborted once; retries use actual backend/SII",
      personalDataRecorded: false,
      results,
      passed: !failed,
    },
    null,
    2,
  ),
);
if (failed) process.exitCode = 1;
