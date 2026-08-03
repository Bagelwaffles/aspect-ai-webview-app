import assert from "node:assert/strict"
import test from "node:test"

import {
  createInternalAdminCookie,
  verifyInternalAdminCookie,
} from "../app/lib/internal-admin-cookie"
import {
  createInternalAdminPasswordHash,
  DistributedAdminLoginThrottle,
  isSupportedInternalAdminPasswordHash,
  type AdminLoginThrottleAdapter,
  type AdminLoginThrottleStorageResult,
  verifyInternalAdminPassword,
} from "../lib/server/internal-admin-security"

class FakeAdminLoginThrottleAdapter implements AdminLoginThrottleAdapter {
  private readonly counts = new Map<string, number>()
  readonly keys: string[] = []
  fail = false

  async reserve(key: string, windowMs: number): Promise<AdminLoginThrottleStorageResult> {
    if (this.fail) throw new Error("simulated datastore outage")

    this.keys.push(key)
    const count = (this.counts.get(key) ?? 0) + 1
    this.counts.set(key, count)
    return { count, resetInMs: windowMs }
  }

  async release(key: string): Promise<void> {
    if (this.fail) throw new Error("simulated datastore outage")

    const count = this.counts.get(key) ?? 0
    if (count <= 1) {
      this.counts.delete(key)
      return
    }

    this.counts.set(key, count - 1)
  }
}

test("internal admin passwords use a supported scrypt hash and reject wrong input", async () => {
  const password = "a strong test-only admin password"
  const hash = await createInternalAdminPasswordHash(password, new Uint8Array(16).fill(7))

  assert.equal(isSupportedInternalAdminPasswordHash(hash), true)
  assert.equal(await verifyInternalAdminPassword(password, hash), true)
  assert.equal(await verifyInternalAdminPassword("wrong password", hash), false)
  assert.equal(await verifyInternalAdminPassword(password, "not-a-supported-hash"), false)
})

test("distributed admin throttle limits attempts and stores only opaque identities", async () => {
  const adapter = new FakeAdminLoginThrottleAdapter()
  const throttle = new DistributedAdminLoginThrottle(adapter, 2, 60_000)

  const first = await throttle.reserve("192.0.2.10")
  const second = await throttle.reserve("192.0.2.10")
  const third = await throttle.reserve("192.0.2.10")

  assert.equal(first.allowed, true)
  assert.equal(second.allowed, true)
  assert.equal(third.allowed, false)
  assert.ok(adapter.keys.every((key) => key.startsWith("ams:rate-limit:admin-login:")))
  assert.ok(adapter.keys.every((key) => !key.includes("192.0.2.10")))
})

test("a successful admin login reservation is released without clearing other failures", async () => {
  const adapter = new FakeAdminLoginThrottleAdapter()
  const throttle = new DistributedAdminLoginThrottle(adapter, 2, 60_000)

  await throttle.reserve("198.51.100.2")
  const successfulReservation = await throttle.reserve("198.51.100.2")
  assert.equal(successfulReservation.allowed, true)
  assert.equal(await throttle.release("198.51.100.2"), true)

  const nextFailure = await throttle.reserve("198.51.100.2")
  const blocked = await throttle.reserve("198.51.100.2")
  assert.equal(nextFailure.allowed, true)
  assert.equal(blocked.allowed, false)
})

test("admin login throttle fails closed when distributed storage is unavailable", async () => {
  const adapter = new FakeAdminLoginThrottleAdapter()
  adapter.fail = true
  const throttle = new DistributedAdminLoginThrottle(adapter)

  const result = await throttle.reserve("203.0.113.5")
  assert.equal(result.available, false)
  assert.equal(result.allowed, false)
  assert.equal(await throttle.release("203.0.113.5"), false)
})

test("internal admin cookie verifies with its independent key and rejects tampering", async () => {
  const secret = "session-signing-secret-that-is-long-enough"
  const token = await createInternalAdminCookie("admin@example.com", secret)

  const verified = await verifyInternalAdminCookie(token, secret)
  assert.equal(verified?.email, "admin@example.com")

  const replacement = token.endsWith("a") ? "b" : "a"
  const tampered = `${token.slice(0, -1)}${replacement}`
  assert.equal(await verifyInternalAdminCookie(tampered, secret), null)
  assert.equal(await verifyInternalAdminCookie(token, "another-session-signing-secret-long-enough"), null)
  assert.equal(await verifyInternalAdminCookie(token, "too-short"), null)
})
