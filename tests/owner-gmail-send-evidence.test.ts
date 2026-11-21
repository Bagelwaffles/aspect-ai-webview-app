import assert from "node:assert/strict"
import test from "node:test"
import { readOwnerAlertReceiptProof, saveOwnerAlertReceiptProof } from "../lib/server/owner-gmail-send-evidence"
import type { GmailRedis } from "../lib/server/owner-gmail"

function fakeStore() {
  const m = new Map<string, string>()
  const redis: GmailRedis = {
    async get<T>(key: string) { return (m.get(key) ?? null) as T | null },
    async set(key: string, value: string) { m.set(key, value); return "OK" },
    async eval() { return null },
  }
  return { redis, m }
}

test("only a recorded same-grant owner inbox receipt is shown as verified", async () => {
  const { redis, m } = fakeStore()
  const now = new Date("2026-10-09T23:00:00.000Z")
  const connected = "2026-10-08T21:00:00.000Z"
  assert.equal(await readOwnerAlertReceiptProof(redis, "owner:", connected, now), null)
  assert.equal(await saveOwnerAlertReceiptProof(redis, "owner:", connected, now), now.toISOString())
  assert.equal(await readOwnerAlertReceiptProof(redis, "owner:", connected, now), now.toISOString())
  assert.equal(await readOwnerAlertReceiptProof(redis, "owner:", "2026-10-09T22:00:00.000Z", now), null)
  assert.equal(await readOwnerAlertReceiptProof(redis, "owner:", connected, new Date(now.getTime() + 31 * 86400_000)), null)
  assert.deepEqual(Object.keys(JSON.parse(m.get("owner:owner-alert-receipt-proof")!)).sort(), ["grantConnectedAt", "receiptVerifiedAt"])
})

test("malformed and future-dated receipt evidence fails closed", async () => {
  const { redis, m } = fakeStore()
  const now = new Date("2026-10-09T23:00:00.000Z")
  const grant = "2026-10-08T21:00:00.000Z"
  m.set("owner:owner-alert-receipt-proof", JSON.stringify({ grantConnectedAt: grant, receiptVerifiedAt: "2028-01-01T00:00:00.000Z" }))
  assert.equal(await readOwnerAlertReceiptProof(redis, "owner:", grant, now), null)
  m.set("owner:owner-alert-receipt-proof", JSON.stringify({ verified: true }))
  assert.equal(await readOwnerAlertReceiptProof(redis, "owner:", grant, now), null)
})
