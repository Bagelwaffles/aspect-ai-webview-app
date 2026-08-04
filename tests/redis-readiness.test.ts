import assert from "node:assert/strict"
import test from "node:test"

import { checkRedisReadiness } from "../lib/server/redis-readiness"

test("readiness fails closed when Redis is not configured", async () => {
  const result = await checkRedisReadiness(null)

  assert.deepEqual(result, {
    state: "missing",
    configured: false,
    checked: false,
    latencyMs: null,
  })
})

test("readiness reports ready only after a real PONG", async () => {
  const result = await checkRedisReadiness({ ping: async () => "PONG" })

  assert.equal(result.state, "ready")
  assert.equal(result.configured, true)
  assert.equal(result.checked, true)
  assert.equal(typeof result.latencyMs, "number")
})

test("readiness fails closed on an invalid response", async () => {
  const result = await checkRedisReadiness({ ping: async () => "NOPE" })

  assert.equal(result.state, "unavailable")
  assert.equal(result.configured, true)
  assert.equal(result.checked, true)
})

test("readiness fails closed when Redis rejects", async () => {
  const result = await checkRedisReadiness({
    ping: async () => {
      throw new Error("connection refused")
    },
  })

  assert.equal(result.state, "unavailable")
  assert.equal(result.configured, true)
  assert.equal(result.checked, true)
})

test("readiness fails closed when Redis exceeds the timeout", async () => {
  const result = await checkRedisReadiness(
    {
      ping: () => new Promise(() => undefined),
    },
    5,
  )

  assert.equal(result.state, "unavailable")
  assert.equal(result.configured, true)
  assert.equal(result.checked, true)
})
