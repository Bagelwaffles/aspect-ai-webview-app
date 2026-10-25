import { test } from "node:test"
import assert from "node:assert/strict"
import { pilotReceiptOnlyWindowOpen } from "../lib/server/quick-audit-isolated-stripe-pilot"
import { RESEND_PREVIEW_BRANCH } from "../lib/server/quick-audit-resend-preview-preflight"

const now = Date.parse("2026-10-25T21:00:00.000Z")
const base: NodeJS.ProcessEnv = {
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: RESEND_PREVIEW_BRANCH,
  AMS_STRIPE_PILOT_WEBHOOK_INTAKE_ENABLED: "true",
  AMS_STRIPE_PILOT_WEBHOOK_INTAKE_UNTIL: new Date(now + 6 * 60_000).toISOString(),
}

test("real external webhook intake requires an explicit expiring short Preview-only window", () => {
  assert.equal(pilotReceiptOnlyWindowOpen(base, now), true)
  assert.equal(pilotReceiptOnlyWindowOpen(base, now + 6 * 60_000), false)
  const forbidden: NodeJS.ProcessEnv[] = [
    { ...base, VERCEL_ENV: "production" },
    { ...base, VERCEL_GIT_COMMIT_REF: "main" },
    { ...base, AMS_STRIPE_PILOT_WEBHOOK_INTAKE_ENABLED: "false" },
    { ...base, AMS_STRIPE_PILOT_WEBHOOK_INTAKE_UNTIL: "" },
    { ...base, AMS_STRIPE_PILOT_WEBHOOK_INTAKE_UNTIL: "not-a-date" },
    { ...base, AMS_STRIPE_PILOT_WEBHOOK_INTAKE_UNTIL: new Date(now).toISOString() },
    { ...base, AMS_STRIPE_PILOT_WEBHOOK_INTAKE_UNTIL: new Date(now + 10 * 60_000 + 1).toISOString() },
    ...[
      "AMS_STRIPE_PILOT_FULFILLMENT_ENABLED",
      "AMS_QUICK_AUDIT_PILOT_DISPATCH_ENABLED",
      "AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED",
      "AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED",
    ].map(k => ({ ...base, [k]: "true" })),
  ]
  for (const env of forbidden) {
    assert.equal(pilotReceiptOnlyWindowOpen(env, now), false)
  }
})

test("window is time-bound at request time and not reopened by clock passing", () => {
  assert.equal(pilotReceiptOnlyWindowOpen(base, now + 359_999), true)
  assert.equal(pilotReceiptOnlyWindowOpen(base, now + 360_000), false)
  assert.equal(pilotReceiptOnlyWindowOpen({ ...base, AMS_STRIPE_PILOT_WEBHOOK_INTAKE_UNTIL: undefined }, now), false)
})
