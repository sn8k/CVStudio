import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
await mkdir(join(root, ".test-artifacts"), { recursive: true });
const temporaryDirectory = await mkdtemp(join(root, ".test-artifacts", "auth-security-"));
const databasePath = join(temporaryDirectory, "test.db");
const port = 4317;
const baseURL = `http://127.0.0.1:${port}`;
const adminEmail = "admin-security@example.test";
const otherEmail = "other-security@example.test";
const adminPassword = randomBytes(24).toString("base64url");
const otherPassword = randomBytes(24).toString("base64url");
const env = {
  ...process.env,
  DATABASE_URL: `file:${databasePath.replaceAll("\\", "/")}`,
  BETTER_AUTH_URL: baseURL,
  PUBLIC_SITE_URL: baseURL,
  BETTER_AUTH_SECRET: randomBytes(48).toString("base64url"),
  ADMIN_EMAIL: adminEmail,
  ADMIN_PASSWORD: adminPassword,
  NEXT_TELEMETRY_DISABLED: "1",
};

function run(args, extraEnv = {}) {
  const result = spawnSync(process.execPath, args, { cwd: root, env: { ...env, ...extraEnv }, encoding: "utf8", timeout: 30_000 });
  if (result.status !== 0) throw new Error(`Test setup failed: ${args[0]} ${args[1]}\n${result.stdout}\n${result.stderr}`);
}

let server;
try {
  await writeFile(databasePath, "");
  run(["node_modules/prisma/build/index.js", "migrate", "deploy"]);
  run(["--import", "tsx", "prisma/seed.ts"]);
  run(["--import", "tsx", "--input-type=module", "-e", `
    const { auth } = await import('./lib/auth.ts');
    const { prisma } = await import('./lib/prisma.ts');
    try {
      await auth.api.signUpEmail({ body: { email: process.env.TEST_SECONDARY_EMAIL, password: process.env.TEST_SECONDARY_PASSWORD, name: 'Other account' } });
    } finally {
      await prisma.$disconnect();
    }
  `], { TEST_SECONDARY_EMAIL: otherEmail, TEST_SECONDARY_PASSWORD: otherPassword });

  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: root, env, stdio: "ignore",
  });
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error("Production server exited before readiness");
    try {
      const response = await fetch(`${baseURL}/api/health`);
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert(ready, "Production server did not become ready");
  const headersResponse = await fetch(`${baseURL}/api/health`);
  assert(headersResponse.headers.get("content-security-policy")?.includes("frame-ancestors 'none'"), "CSP is missing");
  assert(headersResponse.headers.get("strict-transport-security"), "HSTS is missing");

  const signup = await fetch(`${baseURL}/api/auth/sign-up/email`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: baseURL },
    body: JSON.stringify({ email: "public-security@example.test", password: randomBytes(24).toString("base64url"), name: "Public account" }),
  });
  assert.equal(signup.status, 403, "Public signup remains open");

  async function signIn(email, password) {
    const response = await fetch(`${baseURL}/api/auth/sign-in/email`, {
      method: "POST", headers: { "Content-Type": "application/json", Origin: baseURL },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(response.status, 200, `Sign in failed for ${email}`);
    const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
    assert(cookie?.includes("session_token="), "Sign in did not issue a session cookie");
    return cookie;
  }

  const otherCookie = await signIn(otherEmail, otherPassword);
  const otherAdmin = await fetch(`${baseURL}/admin`, { headers: { Cookie: otherCookie }, redirect: "manual" });
  assert.equal(otherAdmin.status, 307, "Non-admin account can access /admin");
  const otherExport = await fetch(`${baseURL}/api/admin/export`, { headers: { Cookie: otherCookie } });
  assert.equal(otherExport.status, 401, "Non-admin account can export private data");

  const adminCookie = await signIn(adminEmail, adminPassword);
  const adminPage = await fetch(`${baseURL}/admin`, { headers: { Cookie: adminCookie }, redirect: "manual" });
  assert.equal(adminPage.status, 200, "Configured admin cannot access /admin");
  console.log("Auth security passed: public signup 403, other account blocked from admin and export, configured admin 200, security headers present.");
} finally {
  if (server?.pid) {
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else server.kill("SIGTERM");
  }
  await rm(temporaryDirectory, { recursive: true, force: true });
}
