import assert from "node:assert/strict"
import test from "node:test"

import {
  disconnectCustomerConnection,
  getCustomerConnectionSecret,
  listCustomerConnections,
  saveCustomerConnection,
} from "../lib/server/customer-connections"

class FakeRedis {
  readonly values = new Map<string, string>()

  async get<T = unknown>(key: string): Promise<T | null> {
    const value = this.values.get(key)
    return (value ?? null) as T | null
  }

  async set(key: string, value: string) {
    this.values.set(key, value)
    return "OK"
  }

  async del(key: string) {
    this.values.delete(key)
    return 1
  }
}

const subject = `customer:google:${"c".repeat(64)}`
const env = {
  AMS_CONNECTION_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
} as NodeJS.ProcessEnv

test("connection tokens are encrypted at rest and public records omit secrets", async () => {
  const redis = new FakeRedis()
  const connection = await saveCustomerConnection(
    subject,
    {
      provider: "google-drive",
      accountLabel: "team@example.com",
      scopes: ["drive.readonly"],
      accessToken: "access-secret-value",
      refreshToken: "refresh-secret-value",
      expiresAt: "2026-09-12T18:00:00.000Z",
    },
    { redis, env, now: () => new Date("2026-09-11T18:00:00.000Z") },
  )

  assert.equal(connection.provider, "google-drive")
  assert.equal("accessToken" in connection, false)
  const stored = [...redis.values.values()].join("\n")
  assert.doesNotMatch(stored, /access-secret-value/)
  assert.doesNotMatch(stored, /refresh-secret-value/)

  const secret = await getCustomerConnectionSecret(subject, "google-drive", { redis, env })
  assert.equal(secret?.secret.accessToken, "access-secret-value")
  assert.equal(secret?.secret.refreshToken, "refresh-secret-value")
})

test("connection list is tenant-scoped and disconnect removes only the selected provider", async () => {
  const redis = new FakeRedis()

  await saveCustomerConnection(
    subject,
    {
      provider: "linkedin",
      scopes: ["r_liteprofile"],
      accessToken: "token-a",
    },
    { redis, env },
  )
  await saveCustomerConnection(
    subject,
    {
      provider: "slack",
      scopes: ["channels:read"],
      accessToken: "token-b",
    },
    { redis, env },
  )

  assert.equal((await listCustomerConnections(subject, { redis, env })).length, 2)
  await disconnectCustomerConnection(subject, "linkedin", { redis, env })
  const remaining = await listCustomerConnections(subject, { redis, env })
  assert.deepEqual(remaining.map((item) => item.provider), ["slack"])
})
