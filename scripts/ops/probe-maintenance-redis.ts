import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

import { Redis } from "@upstash/redis"

import type { BackendMonitorEvent } from "../../lib/server/backend-monitoring"
import {
  getMaintenanceFinding,
  ingestBackendMonitorEvents,
  listMaintenanceFindings,
} from "../../lib/server/maintenance-lifecycle"

async function main() {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token || !/^https?:\/\/127\.0\.0\.1:8079\/?$/u.test(url)) {
    throw new Error("MAINTENANCE_ACCEPTANCE_REQUIRES_LOCAL_CI_REDIS_ONLY")
  }
  const redis = new Redis({ url, token })
  assert.equal(String(await redis.ping()).toUpperCase(), "PONG")
  const now = new Date()
  const fingerprint = "ci-repair-" + randomUUID()
  const event: BackendMonitorEvent = {
    id: randomUUID(),
    monitorKey: "visibility-catalog",
    monitorTitle: "Visibility & Catalog Truth",
    fromStatus: "ok",
    toStatus: "warning",
    summary: "CI-only controlled test catalog mismatch",
    details: ["Synthetic CI fixture, never production telemetry"],
    createdAt: now.toISOString(),
    fingerprint,
    recovery: false,
  }
  const first = await ingestBackendMonitorEvents([event], { redis, now })
  const second = await ingestBackendMonitorEvents([{ ...event, id: randomUUID() }], { redis, now })
  assert.deepEqual(first, { ingested: 1, duplicates: 0, ignored: 0 })
  assert.deepEqual(second, { ingested: 0, duplicates: 1, ignored: 0 })
  const indexed = await listMaintenanceFindings(10, { redis })
  const finding = indexed.find((item) => item.sourceFingerprint === fingerprint)
  assert.ok(finding, "finding must be retrievable from live isolated Redis")
  assert.equal(finding.state, "observed")
  assert.equal(finding.pr, null)
  const reread = await getMaintenanceFinding(finding.id, { redis })
  assert.equal(reread?.id, finding.id)
  // Clean up even though the Redis service is isolated and ephemeral.
  await redis.del("ams:maintenance:v1:finding:" + finding.id)
  await redis.lrem("ams:maintenance:v1:index", 0, finding.id)
  console.log("Maintenance Redis acceptance: persisted, deduplicated, read back, and cleaned.")
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "MAINTENANCE_REDIS_ACCEPTANCE_FAILED")
  process.exitCode = 1
})
