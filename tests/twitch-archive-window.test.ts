import assert from "node:assert/strict"
import { createCipheriv } from "node:crypto"
import test from "node:test"
import { getTwitchRecentArchive } from "../lib/server/twitch-pilot"

test("historical archive paginates VODs and clips and includes newly generated historical clips", async () => {
  const key = Buffer.alloc(32, 7)
  const iv = Buffer.alloc(12, 3)
  const cipher = createCipheriv("aes-256-gcm", new Uint8Array(key), new Uint8Array(iv))
  const cipherText = cipher.update(JSON.stringify({ accessToken: "test-access", refreshToken: "test-refresh", expiresAt: null }), "utf8", "hex") + cipher.final("hex")
  const record = { broadcasterId: "123", login: "smokybanana03", displayName: "SmokyBanana03", scopes: [],
    connectedAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", cipherText,
    iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64") }
  const env = { NODE_ENV: "test" as const, AMS_CONNECTION_ENCRYPTION_KEY: key.toString("base64"), AMS_TWITCH_CLIENT_ID: "test-client",
    AMS_TWITCH_CLIENT_SECRET: "test-client-secret", AMS_TWITCH_EVENTSUB_SECRET: "test-eventsub-secret-123456789", PUBLIC_APP_URL: "https://ams.example.test" }
  const requests: URL[] = []
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input)); requests.push(url)
    if (url.pathname === "/oauth2/token") return Response.json({ access_token: "test-app-token" })
    if (url.pathname.endsWith("/videos")) return Response.json(url.searchParams.get("after")
      ? { data: [{ id: "2", created_at: "2026-09-14T00:00:00.000Z", duration: "1h" }, { id: "0", created_at: "2026-08-01T00:00:00.000Z", duration: "1h" }], pagination: {} }
      : { data: [{ id: "1", created_at: "2026-09-28T00:00:00.000Z", duration: "1h" }], pagination: { cursor: "vod-next" } })
    return Response.json(url.searchParams.get("after")
      ? { data: [{ id: "clip-new", created_at: "2026-10-04T00:00:00.000Z", video_id: "1" }], pagination: {} }
      : { data: [{ id: "clip-old", created_at: "2026-09-28T00:00:00.000Z", video_id: "1" }], pagination: { cursor: "clip-next" } })
  }
  const result = await getTwitchRecentArchive(31 * 24, { env, redis: { get: async () => record } as never,
    fetcher, now: () => new Date("2026-10-04T12:00:00.000Z") }, new Date("2026-10-03T12:00:00.000Z"))
  assert.deepEqual(result.vods.map(vod => vod.id), ["1", "2"])
  assert.deepEqual(result.clips.map(clip => clip.id), ["clip-old", "clip-new"])
  assert.equal(result.endedAt, "2026-10-03T12:00:00.000Z")
  assert.equal(requests.find(url => url.pathname.endsWith("/clips"))?.searchParams.get("ended_at"), "2026-10-04T12:00:00.000Z")
  assert.ok(requests.some(url => url.searchParams.get("after") === "vod-next"))
  assert.ok(requests.some(url => url.searchParams.get("after") === "clip-next"))
})
