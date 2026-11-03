import assert from "node:assert/strict"
import test from "node:test"

import { filterGithubActionFailures, ingestGithubActionFailures } from "../lib/server/maintenance-github-source"
import type { MaintenanceRedis } from "../lib/server/maintenance-lifecycle"

const now = new Date("2026-10-15T15:00:00.000Z")
const sha = "a".repeat(40)
function run(overrides: Record<string, unknown> = {}) {
  return {
    id: 38831346152,
    name: "Secret scan",
    status: "completed",
    conclusion: "failure",
    event: "push",
    head_branch: "main",
    head_sha: sha,
    created_at: "2026-10-15T14:00:00.000Z",
    run_attempt: 1,
    html_url: "https://github.com/Bagelwaffles/aspect-ai-webview-app/actions/runs/38831346152",
    ...overrides,
  }
}

class RedisFixture implements MaintenanceRedis {
  rows = new Map<string, string>()
  index: string[] = []
  async get<T = unknown>(key: string): Promise<T | null> {
    return (this.rows.get(key) ?? null) as T | null
  }
  async set(key: string, value: string, options?: { nx?: boolean; ex?: number }) {
    if (options?.nx && this.rows.has(key)) return null
    this.rows.set(key, value)
    return "OK"
  }
  async lpush(key: string, ...values: string[]) {
    this.index.unshift(...values)
    return this.index.length
  }
  async ltrim(_key: string, start: number, stop: number) {
    this.index = this.index.slice(start, stop + 1)
    return "OK"
  }
  async lrange<T = unknown>(_key: string, start: number, stop: number): Promise<T[]> {
    return this.index.slice(start, stop + 1) as T[]
  }
}

test("GitHub source accepts only real failed watched main-branch workflows", () => {
  const signal = filterGithubActionFailures({ workflow_runs: [run()] }, now)
  assert.equal(signal.length, 1)
  assert.equal(signal[0].area, "github-security")
  assert.equal(signal[0].policy, "escalate")
  assert.equal(signal[0].state, "observed")
  assert.match(signal[0].evidenceUrl ?? "", /github\.com.*\/actions\/runs\/38831346152/u)
  assert.equal(signal[0].confidence, "monitor_signal")
})

test("filter rejects success, cancellation, forged links, stale data, foreign branch and injected name", () => {
  const candidates = [
    run({ conclusion: "success" }), run({ conclusion: "cancelled" }),
    run({ html_url: "https://evil.example/actions/runs/38831346152" }),
    run({ created_at: "2026-10-12T11:00:00.000Z" }),
    run({ created_at: "2026-10-16T15:00:00.000Z" }),
    run({ head_branch: "preview" }), run({ event: "pull_request" }),
    run({ name: "Security check; deploy anyway" }), run({ id: "38831346152" }),
    run({ run_attempt: -1 }), run({ head_sha: "not-a-sha" }),
  ]
  assert.deepEqual(filterGithubActionFailures({ workflow_runs: candidates }, now), [])
  assert.throws(() => filterGithubActionFailures({ error: "rate limit exceeded" }, now), /PAYLOAD_INVALID/u)
  assert.throws(() => filterGithubActionFailures({ workflow_runs: new Array(101).fill(run()) }, now), /PAYLOAD_INVALID/u)
})

test("a real failure is stored once, and GitHub/Redis failures are explicit", async () => {
  const redis = new RedisFixture()
  let calls = 0
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls++
    assert.equal(String(url), "https://api.github.com/repos/Bagelwaffles/aspect-ai-webview-app/actions/runs?branch=main&per_page=30")
    assert.equal(init?.method, "GET")
    return new Response(JSON.stringify({ workflow_runs: [run()] }), { status: 200 })
  }) as typeof fetch
  const opts = { redis, now, fetcher, env: { NODE_ENV: "test" } as NodeJS.ProcessEnv }
  assert.deepEqual(await ingestGithubActionFailures(opts), { seen: 1, ingested: 1, duplicates: 0 })
  assert.deepEqual(await ingestGithubActionFailures(opts), { seen: 1, ingested: 0, duplicates: 1 })
  assert.equal(calls, 2)
  assert.equal(redis.index.length, 1)
  await assert.rejects(ingestGithubActionFailures({ ...opts, redis: null }), /MAINTENANCE_STORE_UNAVAILABLE/u)
  const unavailable = (async () => new Response("API rate limit", { status: 403 })) as typeof fetch
  await assert.rejects(
    ingestGithubActionFailures({ ...opts, fetcher: unavailable }), /MAINTENANCE_GITHUB_UNAVAILABLE/u,
  )
})

test("Twitch run failure becomes escalation only; no public upload or repair implied", () => {
  const record = filterGithubActionFailures({
    workflow_runs: [run({ name: "Twitch Short Render Worker", event: "schedule", conclusion: "timed_out" })],
  }, now)
  assert.equal(record.length, 1)
  assert.equal(record[0].policy, "escalate")
  assert.equal(record[0].severity, "warning")
  assert.equal(record[0].pr, null)
})
