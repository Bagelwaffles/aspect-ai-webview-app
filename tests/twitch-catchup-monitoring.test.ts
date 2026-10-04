import assert from "node:assert/strict"
import test from "node:test"
import { getTwitchCatchupStatus, recordTwitchCatchupWorker, vodMetadata } from "../lib/server/twitch-catchup"

function memoryStore() {
  const data = new Map<string, unknown>()
  return {
    data,
    redis: {
      async get(key: string) { return data.get(key) ?? null },
      async set(key: string, value: unknown, options?: { nx?: boolean }) {
        if (options?.nx && data.has(key)) return null
        data.set(key, value)
        return "OK"
      },
      async del(key: string) { return Number(data.delete(key)) },
    } as never,
  }
}

test("scheduled worker health and stalled VODs are visible", async () => {
  const state = memoryStore()
  state.data.set("ams:twitch-catchup:v1:index", JSON.stringify(["123"]))
  state.data.set("ams:twitch-catchup:v1:vod:123", JSON.stringify({
    vodId: "123", streamer: "SmokyBanana03", title: "Game",
    createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z",
    durationSeconds: 60, status: "rendering", lease: null, youtubeVideoId: null,
    errorCode: null, metadata: vodMetadata({ id: "123", title: "Game", createdAt: "2026-10-03T00:00:00.000Z" }),
  }))

  await recordTwitchCatchupWorker({ phase: "started", trigger: "schedule" }, state)
  assert.equal((await getTwitchCatchupStatus(state)).monitoring.scheduledStale, true)

  await recordTwitchCatchupWorker({ phase: "succeeded", trigger: "schedule" }, state)
  const status = await getTwitchCatchupStatus(state)
  assert.equal(status.monitoring.scheduledStale, false)
  assert.ok(status.monitoring.worker?.lastScheduledSucceededAt)
  assert.equal(status.jobs[0].stalled, true)
  assert.deepEqual(status.monitoring.stalledVodIds, ["123"])
})
