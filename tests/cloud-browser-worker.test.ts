import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  dispatchCloudBrowserWorker,
  getCloudBrowserConfiguration,
  pairCloudBrowserWorker,
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
  assert.match(source, /updateNetworkPolicy/u)
  assert.match(source, /ams-browser-worker/u)
  assert.match(source, /playwright.*1\.62\.1/u)
  assert.match(source, /playwright", "install", "--with-deps", "chromium"/u)
  assert.doesNotMatch(source, /VERCEL_TOKEN/u)
})

test("cloud worker project pins the Vercel Sandbox SDK", () => {
  const pkg = JSON.parse(readFileSync("tools/vercel-browser-worker/package.json", "utf8")) as {
    dependencies: Record<string, string>
  }
  assert.equal(pkg.dependencies["@vercel/sandbox"], "3.5.0")
})
