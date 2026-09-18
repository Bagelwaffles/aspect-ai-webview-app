import assert from "node:assert/strict"
import test from "node:test"

import {
  buildFallbackStreamIntelligenceDraft,
  buildStreamIntelligencePrompt,
  generateStreamIntelligencePackage,
  resolveStreamIntelligenceTrigger,
  streamIntelligenceInputSchema,
  type StreamIntelligenceInput,
} from "../lib/server/stream-intelligence"
import type {
  TwitchPilotSummary,
  TwitchStreamSession,
} from "../lib/server/twitch-pilot"

function input(overrides: Partial<StreamIntelligenceInput> = {}): StreamIntelligenceInput {
  return streamIntelligenceInputSchema.parse({
    phase: "live",
    streamId: "stream-a",
    broadcasterLogin: "smokybanana03",
    broadcasterName: "SmokyBanana03",
    startedAt: "2026-09-18T22:41:00.000Z",
    endedAt: null,
    title: "Once Human sibling survival",
    categoryName: "Once Human",
    language: "en",
    updateCount: 0,
    durationMinutes: null,
    vod: null,
    markers: [],
    clips: [],
    metadataSummary: null,
    ...overrides,
  })
}

test("EventSub trigger mapping refreshes channel metadata without mutating Twitch", () => {
  assert.deepEqual(resolveStreamIntelligenceTrigger("stream.online", "stream-a"), {
    streamId: "stream-a", phase: "live", force: false,
  })
  assert.deepEqual(resolveStreamIntelligenceTrigger("channel.update", "stream-a"), {
    streamId: "stream-a", phase: "live", force: true,
  })
  assert.deepEqual(resolveStreamIntelligenceTrigger("stream.offline", "stream-a"), {
    streamId: "stream-a", phase: "post-stream", force: false,
  })
  assert.equal(resolveStreamIntelligenceTrigger("channel.update", null), null)
  assert.equal(resolveStreamIntelligenceTrigger("unknown.event", "stream-a"), null)
})

test("fallback package is stream-specific and keeps the evidence boundary explicit", () => {
  const draft = buildFallbackStreamIntelligenceDraft(input())
  assert.match(draft.primarySearchPhrase, /Once Human/i)
  assert.ok(draft.twitch.titleOptions.some((title) => /Once Human/i.test(title)))
  assert.ok(draft.youtube.titleOptions.some((title) => /SmokyBanana03/i.test(title)))
  assert.match(draft.evidenceBoundary, /metadata/i)
  assert.doesNotMatch(draft.evidenceBoundary, /watched the gameplay/i)
})

test("AI prompt forbids invented gameplay and unsupported trend claims", () => {
  const prompt = buildStreamIntelligencePrompt(input())
  assert.match(prompt, /never infer unseen gameplay/i)
  assert.match(prompt, /Never state or imply current search trends or search volume/i)
  assert.match(prompt, /drafts only/i)
})

test("each Twitch stream ID persists an independent content package", async () => {
  const values = new Map<string, string>()
  const redis = {
    async set(key: string, value: string) {
      values.set(key, value)
      return "OK"
    },
    async get(key: string) {
      return values.get(key) ?? null
    },
  }

  let session: TwitchStreamSession = {
    broadcasterId: "155477801",
    broadcasterLogin: "smokybanana03",
    broadcasterName: "SmokyBanana03",
    streamId: "stream-a",
    startedAt: "2026-09-18T22:41:00.000Z",
    endedAt: null,
    title: "Once Human sibling survival",
    categoryId: "game-1",
    categoryName: "Once Human",
    language: "en",
    updates: [],
  }
  let summary: TwitchPilotSummary | null = null

  const options = {
    env: { NODE_ENV: "test" } as NodeJS.ProcessEnv,
    redis: redis as never,
    getStatus: async () => ({ session, summary }),
    refreshSummary: async () => summary,
    runAgent: async (validated: StreamIntelligenceInput) =>
      buildFallbackStreamIntelligenceDraft(validated),
    now: () => new Date("2026-09-18T22:42:00.000Z"),
  }

  const first = await generateStreamIntelligencePackage(
    { streamId: "stream-a", phase: "live" },
    options,
  )
  assert.equal(first.streamId, "stream-a")
  assert.equal(first.generationMode, "ai-gateway")

  session = {
    ...session,
    streamId: "stream-b",
    startedAt: "2026-09-18T23:41:00.000Z",
    title: "Fresh Once Human run",
  }
  const second = await generateStreamIntelligencePackage(
    { streamId: "stream-b", phase: "live" },
    options,
  )

  assert.equal(second.streamId, "stream-b")
  assert.ok(values.has("ams:stream-intelligence:v1:package:stream-a"))
  assert.ok(values.has("ams:stream-intelligence:v1:package:stream-b"))
  assert.notEqual(
    values.get("ams:stream-intelligence:v1:package:stream-a"),
    values.get("ams:stream-intelligence:v1:package:stream-b"),
  )

  summary = null
})
