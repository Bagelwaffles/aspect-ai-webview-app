import assert from "node:assert/strict"
import test from "node:test"

import {
  changeOwnerCampaignPilot,
  createOwnerCampaignPilot,
  dispatchOwnerCampaignPilot,
  ownerCampaignPilotSendingAllowed,
  readOwnerCampaignPilot,
  validateOwnerCampaignPilot,
  type OwnerCampaignPilotInput,
} from "../lib/server/owner-campaign-pilot"
import type { GmailRedis, GmailContext } from "../lib/server/owner-gmail"

const NOW = Date.parse("2026-10-12T18:00:00.000Z")
const env: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  VERCEL_ENV: "preview",
  AMS_OWNER_EMAIL: "owner@example.com",
  AMS_GMAIL_PRIMARY_EMAIL: "primary@example.com",
  AMS_GMAIL_SECONDARY_EMAIL: "secondary@example.com",
  AMS_GMAIL_CLIENT_ID: "test-client",
  AMS_GMAIL_CLIENT_SECRET: "test-client-secret",
  AMS_CONNECTION_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("base64"),
  AMS_GMAIL_CONSENT_MODE: "testing",
  AMS_GMAIL_SEND_ENABLED: "true",
  AMS_OWNER_CAMPAIGN_PILOT_ENABLED: "false",
  PUBLIC_APP_URL: "https://ams.example.com",
}

const input: OwnerCampaignPilotInput = {
  id: "11111111-1111-4111-8111-111111111111",
  sourceRunId: "content-run-22222222-2222-4222-8222-222222222222",
  recipient: "secondary@example.com",
  steps: [
    { subject: "AMS pilot step one", body: "This is a test email for our own marketing workflow.", dueAt: "2026-10-14T14:00:00.000Z" },
    { subject: "AMS pilot step two", body: "This is a second test, not a customer campaign.", dueAt: "2026-10-16T14:00:00.000Z" },
    { subject: "AMS pilot step three", body: "This is a third test, still an owner-only rehearsal.", dueAt: "2026-10-18T14:00:00.000Z" },
  ],
}

function setup() {
  const values = new Map<string, string>()
  const redis: GmailRedis = {
    async get<T>(key: string) { return (values.get(key) ?? null) as T | null },
    async set(key, value, options) {
      if (options?.nx && values.has(key)) return null
      values.set(key, value)
      return "OK"
    },
    async eval(_script, keys, args) {
      const stored = values.get(keys[0])
      if (!stored) return 0
      const prior = JSON.parse(stored) as { revision: number }
      if (prior.revision !== Number(args[0])) return 0
      values.set(keys[0], args[1])
      return 1
    },
  }
  const ctx: GmailContext = { env: { ...env }, redis, now: NOW,
    fetcher: (async () => { throw new Error("send must not happen") }) as typeof fetch }
  return { ctx, values }
}

test("pilot only accepts verified owner-controlled inboxes, never external recipients", () => {
  assert.equal(validateOwnerCampaignPilot(input, env, NOW).recipient, "secondary@example.com")
  assert.throws(() => validateOwnerCampaignPilot({
    ...input, recipient: "customer@example.net",
  }, env, NOW), /CAMPAIGN_TEST_RECIPIENT_REQUIRED/)
  assert.throws(() => validateOwnerCampaignPilot({
    ...input, steps: [
      { ...input.steps[0], subject: "Okay\r\nBcc: someone@example.net" },
      input.steps[1], input.steps[2],
    ],
  }, env, NOW))
  assert.throws(() => validateOwnerCampaignPilot({
    ...input, steps: [input.steps[0], input.steps[0], input.steps[2]],
  }, env, NOW), /CAMPAIGN_TEST_CADENCE_INVALID/)
})

test("explicit pilot switch is default-off, preview-only and separate from owner auto replies", () => {
  assert.equal(ownerCampaignPilotSendingAllowed(env), false)
  assert.equal(ownerCampaignPilotSendingAllowed({
    ...env, AMS_OWNER_CAMPAIGN_PILOT_ENABLED: "true", VERCEL_ENV: "production",
  }), false)
  assert.equal(ownerCampaignPilotSendingAllowed({
    ...env, AMS_OWNER_CAMPAIGN_PILOT_ENABLED: "true", AMS_GMAIL_SEND_ENABLED: "false",
  }), false)
  assert.equal(ownerCampaignPilotSendingAllowed({
    ...env, AMS_OWNER_CAMPAIGN_PILOT_ENABLED: "true",
  }), true)
})

test("plan persists idempotently, approval remains review only and stop is terminal", async () => {
  const { ctx } = setup()
  const first = await createOwnerCampaignPilot(input, ctx)
  assert.equal(first.created, true)
  assert.equal(first.record.status, "draft")
  assert.equal(first.record.sends.length, 0)
  assert.equal((await createOwnerCampaignPilot(input, ctx)).created, false)
  await assert.rejects(
    () => createOwnerCampaignPilot({ ...input, recipient: "primary@example.com" }, ctx),
    /CAMPAIGN_IDEMPOTENCY_CONFLICT/,
  )
  const approved = await changeOwnerCampaignPilot(input.id, "approve", ctx)
  assert.equal(approved.status, "approved")
  assert.ok(approved.reviewedAt)
  assert.equal((await readOwnerCampaignPilot(input.id, ctx))?.status, "approved")
  assert.deepEqual(await dispatchOwnerCampaignPilot(input.id, ctx), { status: "disabled" })
  const stopped = await changeOwnerCampaignPilot(input.id, "stop", ctx)
  assert.equal(stopped.status, "stopped")
  await assert.rejects(() => changeOwnerCampaignPilot(input.id, "approve", ctx), /CAMPAIGN_ALREADY_REVIEWED/)
  assert.equal((await readOwnerCampaignPilot(input.id, ctx))?.status, "stopped")
})

test("invalid pilot data cannot be created or enabled by an unauthenticated caller", async () => {
  const { ctx } = setup()
  await assert.rejects(() => createOwnerCampaignPilot({
    ...input,
    recipient: "outside@example.org",
  }, ctx), /CAMPAIGN_TEST_RECIPIENT_REQUIRED/)
  await assert.rejects(
    () => changeOwnerCampaignPilot("44444444-4444-4444-8444-444444444444", "approve", ctx),
    /CAMPAIGN_NOT_FOUND/,
  )
})
