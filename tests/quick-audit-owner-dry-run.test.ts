import assert from "node:assert/strict"
import test from "node:test"

import { NextRequest } from "next/server"
import { createOwnerAuditDryRunHandler } from "../lib/server/quick-audit-owner-dry-run"

const origin = "https://ams-dry-run-preview.vercel.app"
const url = `${origin}/api/internal/quick-audit/owner-pilot/dry-run`
const configured: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  VERCEL_ENV: "preview",
  VERCEL_URL: "ams-dry-run-preview.vercel.app",
  AMS_QUICK_AUDIT_OWNER_DRY_RUN_ENABLED: "true",
  AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL: "owner@example.com",
  AMS_OWNER_EMAIL: "owner@example.com",
  INTERNAL_ADMIN_SECRET: "test-owner-session-secret-32chars",
}

function request(originHeader = origin) {
  return new NextRequest(url, { method: "POST", headers: { origin: originHeader } })
}

function setup(options: {
  env?: NodeJS.ProcessEnv
  identity?: string | null
  collectError?: boolean
} = {}) {
  let collections = 0
  const handler = createOwnerAuditDryRunHandler({
    env: options.env ?? configured,
    ownerEmail: async () => options.identity === undefined ? "owner@example.com" : options.identity,
    uuid: () => "fixed-readonly-dry-run-id",
    now: () => new Date("2026-10-21T19:00:00.000Z"),
    collect: async (target) => {
      collections++
      assert.equal(target, "https://www.aspectmarketingsolutions.app")
      if (options.collectError) throw new Error("Offline — no fallback")
      return {
        hasClearValueProposition: true,
        hasPrimaryCta: true,
        hasContactInfo: true,
        hasTitleAndMeta: true,
        hasTestimonials: false,
        hasPrivacyPolicy: true,
        hasLeadCapture: false,
        hasLocalBusinessSchema: null,
      }
    },
  })
  return { handler, collections: () => collections }
}

test("real-site owner dry-run uses fixed AMS URL, classifies findings, without Stripe or storage", async () => {
  const f = setup()
  const res = await f.handler(request())
  const body = await res.json()
  assert.equal(res.status, 200)
  assert.equal(res.headers.get("cache-control"), "private, no-store")
  assert.equal(body.mode, "preview-dry-run")
  assert.equal(body.result.businessName, "Aspect Marketing Solutions")
  assert.equal(body.result.websiteUrl, "https://www.aspectmarketingsolutions.app")
  assert.equal(body.result.findings.length, 5)
  assert.equal(body.result.sevenDayPlan.length, 7)
  assert.ok(body.result.findings.some((x: {basis: string}) => x.basis === "automated-signal"))
  assert.ok(body.result.findings.some((x: {basis: string}) => x.basis === "strategic-recommendation"))
  assert.equal(body.result.generatedAt, "2026-10-21T19:00:00.000Z")
  assert.equal(body.result.findings.some((x: {title: string}) => x.title.includes("Local discovery")), false)
  assert.equal(f.collections(), 1)
})

test("dry-run denies production, missing flag, wrong owner and invalid origin before network access", async () => {
  const cases = [
    { env: { ...configured, VERCEL_ENV: "production" }, expected: 404 },
    { env: { ...configured, AMS_QUICK_AUDIT_OWNER_DRY_RUN_ENABLED: "false" }, expected: 404 },
    { env: { ...configured, AMS_OWNER_EMAIL: "different@example.com" }, expected: 404 },
    { identity: null, expected: 403 },
    { identity: "other@example.com", expected: 403 },
  ]
  for (const { expected, ...options } of cases) {
    const f = setup(options)
    assert.equal((await f.handler(request())).status, expected)
    assert.equal(f.collections(), 0)
  }
  const originFixture = setup()
  assert.equal((await originFixture.handler(request("https://attacker.example"))).status, 403)
  assert.equal(originFixture.collections(), 0)
})

test("unavailable public-site evidence fails closed instead of fabricating an audit", async () => {
  const f = setup({ collectError: true })
  const res = await f.handler(request())
  assert.equal(res.status, 503)
  assert.equal((await res.json()).code, "AMS_SELF_AUDIT_EVIDENCE_UNAVAILABLE")
  assert.equal(f.collections(), 1)
})
