import assert from "node:assert/strict"
import { createCipheriv } from "node:crypto"
import test from "node:test"
import { buildTwitchAuthorizationUrl, getOwnedTwitchMetadata, TWITCH_METADATA_SCOPE, twitchMetadataInputSchema, updateOwnedTwitchMetadata } from "../lib/server/twitch-pilot"

function fixture(settings: { login?: string; tokenUser?: string; scopes?: string[]; readback?: boolean } = {}) {
  const scopes = settings.scopes ?? ["user:read:broadcast", "channel:manage:clips", TWITCH_METADATA_SCOPE]
  const key = Buffer.alloc(32, 7), iv = Buffer.alloc(12, 3)
  const cipher = createCipheriv("aes-256-gcm", new Uint8Array(key), new Uint8Array(iv))
  const cipherText = cipher.update(JSON.stringify({ accessToken: "test-access", refreshToken: "test-refresh", expiresAt: null }), "utf8", "hex") + cipher.final("hex")
  const record = { broadcasterId: "123", login: settings.login ?? "smokybanana03", displayName: "SmokyBanana03", scopes, connectedAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", cipherText, iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64") }
  const env = { NODE_ENV: "test" as const, AMS_CONNECTION_ENCRYPTION_KEY: key.toString("base64"), AMS_TWITCH_CLIENT_ID: "test-client", AMS_TWITCH_CLIENT_SECRET: "test-secret", AMS_TWITCH_EVENTSUB_SECRET: "test-eventsub-secret-123456789", PUBLIC_APP_URL: "https://ams.example.test" }
  const patches: Array<{ url: URL; body: Record<string, unknown> }> = []
  let title = "Original title", tags = ["FPS"]
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    if (url.pathname === "/oauth2/validate") return Response.json({ client_id: "test-client", login: "smokybanana03", user_id: settings.tokenUser ?? "123", scopes })
    if (url.pathname === "/oauth2/token") return Response.json({ access_token: "test-app-token" })
    if (init?.method === "PATCH") {
      const body = JSON.parse(String(init.body)); patches.push({ url, body })
      if (settings.readback !== false) { if (body.title !== undefined) title = body.title; if (body.tags !== undefined) tags = body.tags }
      return new Response(null, { status: 204 })
    }
    return Response.json({ data: [{ broadcaster_id: "123", broadcaster_login: "smokybanana03", title, tags, game_name: "Call of Duty", broadcaster_language: "en" }] })
  }
  return { options: { env, redis: { get: async () => record } as never, fetcher }, patches }
}

test("metadata OAuth explicitly retains read and clip capabilities", () => {
  const { options } = fixture()
  const url = buildTwitchAuthorizationUrl("state", options.env, true, true)
  assert.deepEqual(url.searchParams.get("scope")?.split(" "), ["user:read:broadcast", "channel:manage:clips", TWITCH_METADATA_SCOPE])
  assert.equal(url.searchParams.get("force_verify"), "true")
})
test("metadata rejects caller-controlled channel IDs, empty titles, malformed tags and oversized lists", () => {
  for (const value of [{ title: "", broadcasterId: "456" }, { title: "x", tags: ["Call of Duty"] }, { tags: Array(11).fill("FPS") }, { title: "x".repeat(141) }, {}]) assert.equal(twitchMetadataInputSchema.safeParse(value).success, false)
})
test("metadata edit targets only the stored channel and reads back exact fields", async () => {
  const { options, patches } = fixture()
  const channel = await updateOwnedTwitchMetadata({ title: "SmokyBanana03 | Call of Duty", tags: ["FPS", "PS5"] }, options)
  assert.equal(channel.title, "SmokyBanana03 | Call of Duty")
  assert.equal(patches.length, 1)
  assert.equal(patches[0].url.searchParams.get("broadcaster_id"), "123")
  assert.deepEqual(Object.keys(patches[0].body).sort(), ["tags", "title"])
})
test("other connected channels cannot be read or edited", async () => {
  const { options, patches } = fixture({ login: "anotherchannel" })
  await assert.rejects(getOwnedTwitchMetadata(options), /TWITCH_METADATA_CHANNEL_MISMATCH/)
  await assert.rejects(updateOwnedTwitchMetadata({ title: "Test" }, options), /TWITCH_METADATA_CHANNEL_MISMATCH/)
  assert.equal(patches.length, 0)
})
test("missing edit scope cannot mutate Twitch", async () => {
  const { options, patches } = fixture({ scopes: ["user:read:broadcast"] })
  await assert.rejects(updateOwnedTwitchMetadata({ title: "Test" }, options), /TWITCH_METADATA_SCOPE_REQUIRED/)
  assert.equal(patches.length, 0)
})
test("token subject mismatch cannot mutate Twitch", async () => {
  const { options, patches } = fixture({ tokenUser: "456" })
  await assert.rejects(updateOwnedTwitchMetadata({ title: "Test" }, options), /TWITCH_METADATA_CHANNEL_MISMATCH/)
  assert.equal(patches.length, 0)
})
test("failed readback is never reported as a verified save", async () => {
  const { options } = fixture({ readback: false })
  await assert.rejects(updateOwnedTwitchMetadata({ title: "New title" }, options), /TWITCH_METADATA_READBACK_FAILED/)
})
