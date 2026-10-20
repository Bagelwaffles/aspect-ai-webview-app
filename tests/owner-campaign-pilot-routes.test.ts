import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"
import { NextRequest } from "next/server"

test("campaign routes require primary owner, trusted origin and explicit Preview send confirmation", async t => {
  const env = {
    GOOGLE_CLIENT_ID: "fixture-client", GOOGLE_CLIENT_SECRET: "fixture-secret",
    NEXTAUTH_SECRET: "fixture-session", AMS_OWNER_EMAIL: "primary@example.com",
    PUBLIC_APP_URL: "https://preview.example.com", NEXTAUTH_URL: "https://preview.example.com",
    VERCEL_ENV: "preview", AMS_OWNER_CAMPAIGN_PILOT_ENABLED: "false",
  }
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]))
  Object.assign(process.env, env)
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  let session: unknown = null
  const require = createRequire(import.meta.url)
  t.mock.method(require("next-auth/next"), "getServerSession", async () => session)
  let externalCalls = 0
  t.mock.method(globalThis, "fetch", async () => {
    externalCalls++
    throw new Error("No provider or Redis I/O expected")
  })
  const pilot = await import("../app/api/owner/campaigns/pilot/route")
  const send = await import("../app/api/owner/campaigns/pilot/send-test/route")
  const receipt = await import("../app/api/owner/campaigns/pilot/verify-receipt/route")
  const request = (method: string, body?: unknown, origin = env.PUBLIC_APP_URL) =>
    new NextRequest(`${env.PUBLIC_APP_URL}/api/owner/campaigns/pilot`, {
      method, headers: { Origin: origin, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  for (const email of [null, "secondary@example.com", "customer@example.com"]) {
    session = email ? { user: { email, customerSubject: `customer:google:${"a".repeat(64)}` } } : null
    for (const response of [
      await pilot.GET(request("GET")), await pilot.POST(request("POST", {})),
      await pilot.PATCH(request("PATCH", {})), await send.POST(request("POST", {})),
      await receipt.POST(request("POST", {})),
    ]) {
      assert.equal(response.status, 401)
      assert.equal(response.headers.get("cache-control"), "no-store")
    }
  }
  session = { user: { email: env.AMS_OWNER_EMAIL, customerSubject: `customer:google:${"a".repeat(64)}` } }
  assert.equal((await pilot.GET(request("GET"))).status, 400)
  for (const handler of [pilot.POST, pilot.PATCH, send.POST, receipt.POST]) {
    assert.equal((await handler(request("POST", {}, "https://attacker.example"))).status, 403)
  }
  const id = "11111111-1111-4111-8111-111111111111"
  assert.equal((await pilot.PATCH(request("PATCH", { id, action: "approve" }))).status, 400)
  assert.equal((await send.POST(request("POST", { id }))).status, 400)
  const disabled = await send.POST(request("POST", { id, confirmation: "AUTHORIZE_SINGLE_OWNER_PREVIEW_TEST" }))
  assert.equal(disabled.status, 503)
  assert.deepEqual(await disabled.json(), { ok: false, code: "PILOT_SEND_DISABLED" })
  process.env.VERCEL_ENV = "production"
  assert.equal((await send.POST(request("POST", {}))).status, 404)
  assert.equal((await receipt.POST(request("POST", {}))).status, 404)
  const manual = {
    id, recipient: "secondary@example.com",
    source: { kind: "owner-authored-preview-test", creditUsage: "none" },
    steps: [0, 1, 2].map(i => ({
      subject: "[AMS PREVIEW TEST] Message " + i,
      body: "Owner-authored Preview test. No AI generation or credits used.",
      dueAt: new Date(Date.now() + (i + 1) * 86400000).toISOString(),
    })),
  }
  const productionManual = await pilot.POST(request("POST", manual))
  assert.equal(productionManual.status, 404)
  assert.equal((await productionManual.json()).code, "CAMPAIGN_MANUAL_SOURCE_PREVIEW_ONLY")
  process.env.VERCEL_ENV = "preview"
  for (const email of [null, "secondary@example.com", "customer@example.com"]) {
    session = email ? { user: { email, customerSubject: `customer:google:${"a".repeat(64)}` } } : null
    assert.equal((await pilot.POST(request("POST", manual))).status, 401)
  }
  session = { user: { email: env.AMS_OWNER_EMAIL, customerSubject: `customer:google:${"a".repeat(64)}` } }
  assert.equal((await pilot.POST(request("POST", manual, "https://attacker.example"))).status, 403)
  assert.equal(externalCalls, 0)
})
