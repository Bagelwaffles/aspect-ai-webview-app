import assert from "node:assert/strict"
import test from "node:test"

import {
  createPendingCustomerAsset,
  customerWorkspaceContext,
  getCustomerWorkspaceProfile,
  listCustomerAssets,
  markCustomerAssetReady,
  saveCustomerWorkspaceProfile,
} from "../lib/server/customer-workspace"

class FakeRedis {
  private readonly values = new Map<string, string>()

  async get<T = unknown>(key: string): Promise<T | null> {
    const value = this.values.get(key)
    if (value === undefined) return null
    return value as T
  }

  async set(key: string, value: string) {
    this.values.set(key, value)
    return "OK"
  }
}

const subjectA = "cus_1234567890abcdef"
const subjectB = "cus_abcdef1234567890"

test("customer workspace profiles are isolated by stable customer subject", async () => {
  const redis = new FakeRedis()

  await saveCustomerWorkspaceProfile(
    subjectA,
    {
      businessName: "Alpha Co",
      websiteUrl: "https://alpha.example",
      audience: "local retailers",
      brandVoice: "direct",
      productsServices: "marketing audits",
      notes: "No guarantees",
    },
    { redis },
  )

  const alpha = await getCustomerWorkspaceProfile(subjectA, { redis })
  const beta = await getCustomerWorkspaceProfile(subjectB, { redis })

  assert.equal(alpha.businessName, "Alpha Co")
  assert.equal(beta.businessName, "")
})

test("customer assets remain tenant isolated and can be marked ready", async () => {
  const redis = new FakeRedis()
  const now = () => new Date("2026-09-11T18:00:00.000Z")
  const id = () => "123e4567-e89b-12d3-a456-426614174000"

  const pending = await createPendingCustomerAsset(
    subjectA,
    { fileName: "brand logo.png", contentType: "image/png", sizeBytes: 1234 },
    { redis, now, id },
  )

  assert.equal(pending.status, "pending")
  assert.match(pending.objectKey, /^customers\/[a-f0-9]{64}\//)
  assert.equal((await listCustomerAssets(subjectB, { redis })).length, 0)

  const ready = await markCustomerAssetReady(subjectA, pending.id, { redis, now })
  assert.equal(ready.status, "ready")
  assert.equal(ready.readyAt, "2026-09-11T18:00:00.000Z")
})

test("workspace context omits blank fields", () => {
  const context = customerWorkspaceContext({
    businessName: "Aspect Marketing Solutions",
    websiteUrl: "",
    audience: "small businesses",
    brandVoice: "",
    productsServices: "AI marketing agents",
    notes: "",
  })

  assert.deepEqual(context, {
    businessName: "Aspect Marketing Solutions",
    audience: "small businesses",
    productsServices: "AI marketing agents",
  })
})
