import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  dispatchCloudBrowserWorker,
  getCloudBrowserConfiguration,
  pairCloudBrowserWorker,
  startCloudBrowserLoginSession,
  stopCloudBrowserWorker,
} from "../lib/server/cloud-browser-dispatch"

const validEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  AMS_CLOUD_BROWSER_ENABLED: "true",
  AMS_CLOUD_BROWSER_WORKER_URL: "https://ams-browser-worker.vercel.app",
  AMS_CLOUD_BROWSER_DISPATCH_KEY: "cloud-browser-test-key-12345678901234567890",
  PUBLIC_APP_URL: "https://www.aspectmarketingsolutions.app",
}

test("cloud browser stays fail-closed until URL and independent dispatch key are valid", () => {
  assert.equal(getCloudBrowserConfiguration({ NODE_ENV: "test" }).configured, false)
  assert.equal(getCloudBrowserConfiguration({
    ...validEnv,
    AMS_CLOUD_BROWSER_DISPATCH_KEY: "replace-with-key",
  }).configured, false)
  assert.equal(getCloudBrowserConfiguration({
    ...validEnv,
    AMS_CLOUD_BROWSER_WORKER_URL: "http://worker.example.com",
  }).configured, false)
  assert.equal(getCloudBrowserConfiguration(validEnv).configured, true)
})

test("disabled cloud browser does not make an external dispatch request", async () => {
  let calls = 0
  const fetcher = (async () => {
    calls += 1
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }) as typeof fetch

  const result = await dispatchCloudBrowserWorker({
    env: { ...validEnv, AMS_CLOUD_BROWSER_ENABLED: "false" },
    fetcher,
  })
  assert.equal(result.status, "disabled")
  assert.equal(calls, 0)
})

test("cloud dispatch authenticates server-to-server without exposing its key in the body", async () => {
  const calls: Array<{ url: string; authorization: string | null; body: string }> = []
  const fetcher = (async (input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({
      url: String(input),
      authorization: new Headers(init?.headers).get("authorization"),
      body: String(init?.body ?? ""),
    })
    return new Response(JSON.stringify({ ok: true, daemon: "started" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  }) as typeof fetch

  const result = await dispatchCloudBrowserWorker({ env: validEnv, fetcher })
  assert.equal(result.status, "dispatched")
  assert.equal(calls.length, 1)
  assert.equal(calls[0].authorization, `Bearer ${validEnv.AMS_CLOUD_BROWSER_DISPATCH_KEY}`)
  assert.doesNotMatch(calls[0].body, /cloud-browser-test-key/u)
})

test("cloud stop authenticates server-to-server without exposing its key in the body", async () => {
  const calls: Array<{ url: string; authorization: string | null; body: string }> = []
  const fetcher = (async (input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({
      url: String(input),
      authorization: new Headers(init?.headers).get("authorization"),
      body: String(init?.body ?? ""),
    })
    return new Response(JSON.stringify({ ok: true, stopped: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  }) as typeof fetch

  const result = await stopCloudBrowserWorker({ env: validEnv, fetcher })
  assert.equal(result.status, "stopped")
  assert.equal(calls.length, 1)
  assert.match(calls[0].url, /\/api\/stop$/u)
  assert.equal(calls[0].authorization, `Bearer ${validEnv.AMS_CLOUD_BROWSER_DISPATCH_KEY}`)
  assert.doesNotMatch(calls[0].body, /cloud-browser-test-key/u)
})

test("cloud owner login session is brokered server-to-server without exposing dispatch key", async () => {
  const calls: Array<{ url: string; authorization: string | null; body: string }> = []
  const fetcher = (async (input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({
      url: String(input),
      authorization: new Headers(init?.headers).get("authorization"),
      body: String(init?.body ?? ""),
    })
    return new Response(JSON.stringify({
      ok: true,
      launchUrl: "https://sandbox.example.vercel.run/#token=ephemeral",
      expiresInSeconds: 600,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  }) as typeof fetch

  const result = await startCloudBrowserLoginSession("https://accounts.google.com/", {
    env: validEnv,
    fetcher,
  })
  assert.equal(result.status, "ready")
  assert.equal(calls.length, 1)
  assert.match(calls[0].url, /\/api\/login-session$/u)
  assert.equal(calls[0].authorization, `Bearer ${validEnv.AMS_CLOUD_BROWSER_DISPATCH_KEY}`)
  assert.doesNotMatch(calls[0].body, /cloud-browser-test-key/u)
})

test("cloud pairing accepts only AMS one-time pairing code format", async () => {
  await assert.rejects(
    pairCloudBrowserWorker("not-a-pairing-code", { env: validEnv }),
    /CLOUD_BROWSER_PAIR_CODE_INVALID/u,
  )
})

test("Vercel cloud executor preserves Browser Control safety gates", () => {
  const worker = readFileSync("tools/vercel-browser-worker/sandbox/worker.mjs", "utf8")
  assert.match(worker, /CLOUD_SECRET_VAULT_NOT_ENABLED/u)
  assert.match(worker, /captcha_required/u)
  assert.match(worker, /mfa_required/u)
  assert.match(worker, /consent_required/u)
  assert.match(worker, /security_check_required/u)
  assert.match(worker, /login_required/u)
  assert.match(worker, /CLOUD_BROWSER_URL_NOT_ALLOWED/u)
  assert.match(worker, /launchPersistentContext/u)
  assert.match(worker, /chromiumSandbox:\s*true/u)
  assert.doesNotMatch(worker, /bypass.*captcha/iu)
  assert.doesNotMatch(worker, /disable-web-security/iu)
})

test("Vercel Sandbox controller uses persistence and egress restriction", () => {
  const source = readFileSync("tools/vercel-browser-worker/lib/sandbox.js", "utf8")
  assert.match(source, /Sandbox\.getOrCreate/u)
  assert.match(source, /snapshotExpiration/u)
  assert.match(source, /PROFILE_SNAPSHOT_RETENTION_MS/u)
  assert.match(source, /90 \* 24 \* 60 \* 60 \* 1000/u)
  assert.match(source, /profileRetentionDays/u)
  assert.match(source, /updateNetworkPolicy/u)
  assert.match(source, /ams-browser-worker/u)
  assert.match(source, /playwright.*1\.62\.1/u)
  assert.match(source, /playwright", "install", "--with-deps", "chromium"/u)
  assert.match(source, /PLAYWRIGHT_BROWSERS_PATH/u)
  assert.match(source, /\.browser-runtime-1\.62\.1-v2/u)
  assert.match(source, /CLOUD_BROWSER_DAEMON_RESET_FAILED/u)
  assert.match(source, /CLOUD_BROWSER_SYSTEM_DEPS_INSTALL_FAILED/u)
  assert.match(source, /INSTALL_NETWORK_ALLOWLIST/u)
  assert.match(source, /finally/u)
  assert.match(source, /\.join\("\\n"\)/u)
  assert.doesNotMatch(source, /VERCEL_TOKEN/u)
})

test("cloud worker project pins the Vercel Sandbox SDK", () => {
  const pkg = JSON.parse(readFileSync("tools/vercel-browser-worker/package.json", "utf8")) as {
    dependencies: Record<string, string>
  }
  assert.equal(pkg.dependencies["@vercel/sandbox"], "3.5.0")
})


test("cloud worker stop endpoint remains dispatch-key protected", () => {
  const source = readFileSync("tools/vercel-browser-worker/api/stop.js", "utf8")
  assert.match(source, /authorizeDispatch/u)
  assert.match(source, /stopCloudBrowserSandbox/u)
  assert.match(source, /METHOD_NOT_ALLOWED/u)
  assert.match(source, /CLOUD_BROWSER_UNAUTHORIZED/u)
})


test("secure cloud login console keeps provider credentials out of AMS control-plane storage", () => {
  const controller = readFileSync("tools/vercel-browser-worker/lib/sandbox.js", "utf8")
  const consoleSource = readFileSync("tools/vercel-browser-worker/sandbox/remote-login.mjs", "utf8")
  const workerEndpoint = readFileSync("tools/vercel-browser-worker/api/login-session.js", "utf8")
  const ownerRoute = readFileSync("app/api/internal/browser-control/cloud/login-session/route.ts", "utf8")
  const lifecycle = readFileSync("app/dashboard/browser-control/lifecycle/CloudBrowserLifecycleClient.tsx", "utf8")

  assert.match(controller, /REMOTE_LOGIN_PORT = 6080/u)
  assert.match(controller, /REMOTE_LOGIN_TTL_MS = 10 \* 60 \* 1000/u)
  assert.match(controller, /randomBytes\(32\)\.toString\("base64url"\)/u)
  assert.match(controller, /ports: \[REMOTE_LOGIN_PORT\]/u)
  assert.match(controller, /#token=/u)
  assert.match(controller, /safeRemoteLoginUrl/u)
  assert.match(controller, /CLOUD_LOGIN_URL_NOT_ALLOWED/u)
  assert.match(controller, /stopProcessFromPidFile\(sandbox, DAEMON_PID_PATH\)/u)
  assert.match(controller, /remoteLoginActive/u)

  assert.match(consoleSource, /timingSafeEqual/u)
  assert.match(consoleSource, /Authorization: "Bearer " \+ token/u)
  assert.match(consoleSource, /history\.replaceState\(null, "", location\.pathname\)/u)
  assert.match(consoleSource, /page\.keyboard\.insertText/u)
  assert.match(consoleSource, /page\.screenshot/u)
  assert.match(consoleSource, /safeUrl/u)
  assert.match(consoleSource, /restartDaemon/u)
  assert.match(consoleSource, /Cache-Control/u)
  assert.match(consoleSource, /Content-Security-Policy/u)
  assert.doesNotMatch(consoleSource, /localStorage/u)
  assert.doesNotMatch(consoleSource, /sessionStorage/u)
  assert.doesNotMatch(consoleSource, /console\.log/u)

  assert.match(workerEndpoint, /authorizeDispatch/u)
  assert.match(workerEndpoint, /startCloudBrowserLoginSession/u)
  assert.match(ownerRoute, /browserAdminAuthorized/u)
  assert.match(ownerRoute, /requestHasTrustedAppOrigin/u)
  assert.match(lifecycle, /Start Secure Cloud Login/u)
  assert.match(lifecycle, /Open Secure Cloud Login Console/u)
  assert.match(lifecycle, /referrerPolicy="no-referrer"/u)
})

test("cloud daemon releases persistent profile before owner login takes control", () => {
  const worker = readFileSync("tools/vercel-browser-worker/sandbox/worker.mjs", "utf8")
  assert.match(worker, /let stopping = false/u)
  assert.match(worker, /await context\.close\(\)\.catch/u)
  assert.match(worker, /process\.on\("SIGTERM", \(\) => \{ void shutdown\(\) \}\)/u)
})
