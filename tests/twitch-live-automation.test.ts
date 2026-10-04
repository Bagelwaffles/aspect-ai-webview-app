import assert from "node:assert/strict"
import test from "node:test"
import { buildAutomaticTwitchMetadata, runAutomaticTwitchMetadata } from "../lib/server/twitch-live-automation"
import type { TwitchStreamSession } from "../lib/server/twitch-pilot"
function fixture() {
  const data = new Map<string, unknown>()
  const redis = { get: async (key: string) => data.get(key) ?? null,
    set: async (key: string, value: unknown, opts?: { nx?: boolean }) => { if (opts?.nx && data.has(key)) return null; data.set(key, value); return "OK" },
    del: async (key: string) => Number(data.delete(key)) }
  const session: TwitchStreamSession = { broadcasterId: "123", broadcasterLogin: "smokybanana03", broadcasterName: "SmokyBanana03",
    streamId: "stream-a", startedAt: "2026-10-04T01:00:00.000Z", endedAt: null, title: "Just chill", categoryId: "1", categoryName: "Call of Duty", language: "en", updates: [] }
  let channel = { login: "smokybanana03", title: "Just chill", category: "Call of Duty", language: "en", tags: ["English"], canEdit: true }
  let writes = 0, lostResponse = false
  const options = { redis: redis as never, getStatus: async () => ({ connected: true, connection: { login: "smokybanana03" }, session }),
    getChannel: async () => channel,
    updateChannel: async (patch: { title: string; tags: string[] }, expected: { streamId: string; title: string; category: string }) => {
      assert.equal(expected.streamId, "stream-a"); assert.equal(expected.title, "Just chill"); assert.equal(expected.category, "Call of Duty")
      writes++; channel = { ...channel, ...patch }
      if (lostResponse) throw new Error("TWITCH_METADATA_UPDATE_FAILED")
      return channel
    } }
  return { options, session, data, writes: () => writes, setChannel: (patch: Partial<typeof channel>) => { channel = { ...channel, ...patch } }, loseResponse: () => { lostResponse = true } }
}
test("automatic copy uses actual title and game and preserves valid existing tags", () => {
  const copy = buildAutomaticTwitchMetadata({ login: "smokybanana03", title: "Just chill", category: "Call of Duty", tags: ["English"], language: "en", canEdit: true })
  assert.equal(copy.title, "Call of Duty | Just chill | SmokyBanana03")
  assert.deepEqual(copy.tags, ["SmokyBanana03", "CallofDuty", "English", "Gaming"])
  assert.equal(buildAutomaticTwitchMetadata({ login: "smokybanana03", title: "x".repeat(140), category: "Call of Duty", tags: [], language: "en", canEdit: true }).title.length, 140)
})
test("one stream applies once despite duplicate events and later channel updates", async () => {
  const f = fixture()
  await runAutomaticTwitchMetadata("stream-a", f.options)
  await runAutomaticTwitchMetadata("stream-a", f.options)
  f.setChannel({ title: "Owner changed title" })
  await runAutomaticTwitchMetadata("stream-a", f.options)
  assert.equal(f.writes(), 1)
})
test("lost PATCH response reconciles exact target without a second write", async () => {
  const f = fixture(); f.loseResponse()
  await assert.rejects(runAutomaticTwitchMetadata("stream-a", f.options), /UPDATE_FAILED/)
  const result = await runAutomaticTwitchMetadata("stream-a", f.options)
  assert.equal("status" in result && result.status, "verified"); assert.equal(f.writes(), 1)
})
test("later manual changes, old events, offline streams, missing scope and other channels cannot mutate", async () => {
  for (const mode of ["manual", "old", "offline", "scope", "other"]) {
    const f = fixture()
    if (mode === "manual") f.setChannel({ title: "Owner title" })
    if (mode === "offline") f.session.endedAt = "2026-10-04T02:00:00.000Z"
    if (mode === "scope") f.setChannel({ canEdit: false })
    if (mode === "other") f.session.broadcasterLogin = "anotherchannel"
    await runAutomaticTwitchMetadata(mode === "old" ? "stream-old" : "stream-a", f.options)
    assert.equal(f.writes(), 0, mode)
  }
})
test("concurrent automatic calls cannot apply twice", async () => {
  const f = fixture()
  await Promise.all([runAutomaticTwitchMetadata("stream-a", f.options), runAutomaticTwitchMetadata("stream-a", f.options)])
  assert.equal(f.writes(), 1)
})
