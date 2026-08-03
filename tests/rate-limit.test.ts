import assert from "node:assert/strict"
import test from "node:test"

import { customerSubjectFromProviderSubject } from "../lib/auth"
import {
  DistributedAiRateLimiter,
  consumeDistributedAiRateLimit,
  type AiRateLimitAdapter,
  type AiRateLimitStorageCommand,
  type AiRateLimitStorageResult,
} from "../lib/server/rate-limit"

class FakeAtomicRateLimitAdapter implements AiRateLimitAdapter {
  private readonly counts = new Map<string, number>()
  readonly commands: AiRateLimitStorageCommand[] = []
  fail = false

  async increment(command: AiRateLimitStorageCommand): Promise<AiRateLimitStorageResult> {
    await Promise.resolve()
    if (this.fail) throw new Error("simulated datastore outage")

    this.commands.push(command)
    const count = (this.counts.get(command.key) ?? 0) + 1
    this.counts.set(command.key, count)
    return { count, resetInMs: command.windowMs }
  }
}

function subject(value: string): string {
  const result = customerSubjectFromProviderSubject(value)
  assert.ok(result)
  return result
}

test("atomic limiter allows only the configured concurrent budget", async () => {
  const adapter = new FakeAtomicRateLimitAdapter()
  const limiter = new DistributedAiRateLimiter(adapter, () => 1_000)

  const results = await Promise.all(
    Array.from({ length: 20 }, () =>
      limiter.consume({
        subject: subject("parallel-customer"),
        operation: "content-generate",
        limit: 5,
        windowMs: 60_000,
      }),
    ),
  )

  assert.equal(results.filter((result) => result.allowed).length, 5)
  assert.equal(results.filter((result) => !result.allowed).length, 15)
  assert.ok(results.every((result) => result.available && result.distributed))
  assert.equal(results.at(-1)?.remaining, 0)
})

test("stable subject and operation form isolated opaque datastore keys", async () => {
  const adapter = new FakeAtomicRateLimitAdapter()
  const limiter = new DistributedAiRateLimiter(adapter)
  const customerA = subject("customer-a-provider-subject")
  const customerB = subject("customer-b-provider-subject")

  await limiter.consume({ subject: customerA, operation: "ai-chat", limit: 2 })
  await limiter.consume({ subject: customerA, operation: "grok-chat", limit: 2 })
  await limiter.consume({ subject: customerB, operation: "ai-chat", limit: 2 })

  const keys = adapter.commands.map((command) => command.key)
  assert.equal(new Set(keys).size, 3)
  assert.ok(keys.every((key) => key.startsWith("ams:rate-limit:ai:")))
  assert.ok(keys.every((key) => !key.includes(customerA) && !key.includes(customerB)))
})

test("datastore failure is explicit and fails closed", async () => {
  const adapter = new FakeAtomicRateLimitAdapter()
  adapter.fail = true
  const result = await new DistributedAiRateLimiter(adapter, () => 5_000).consume({
    subject: subject("outage-customer"),
    operation: "ai-chat",
    limit: 10,
    windowMs: 60_000,
  })

  assert.equal(result.allowed, false)
  assert.equal(result.available, false)
  assert.equal(result.code, "RATE_LIMIT_UNAVAILABLE")
  assert.equal(result.remaining, 0)
})

test("invalid or email-derived identities are rejected before storage", async () => {
  const adapter = new FakeAtomicRateLimitAdapter()
  const limiter = new DistributedAiRateLimiter(adapter)

  const invalidSubject = await limiter.consume({
    subject: "customer:owner@example.com",
    operation: "ai-chat",
  })
  const invalidOperation = await limiter.consume({
    subject: subject("valid-customer"),
    operation: "Bad operation with spaces",
  })

  assert.equal(invalidSubject.code, "RATE_LIMIT_INVALID_IDENTITY")
  assert.equal(invalidSubject.allowed, false)
  assert.equal(invalidOperation.code, "RATE_LIMIT_INVALID_IDENTITY")
  assert.equal(adapter.commands.length, 0)
})

test("missing distributed datastore configuration fails closed", async () => {
  const result = await consumeDistributedAiRateLimit(
    {
      subject: subject("unconfigured-customer"),
      operation: "ai-chat",
    },
    null,
  )

  assert.equal(result.allowed, false)
  assert.equal(result.available, false)
  assert.equal(result.code, "RATE_LIMIT_UNAVAILABLE")
})
