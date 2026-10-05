import assert from "node:assert/strict"
import test from "node:test"

import {
  isManagedIntelligencePilotConfigured,
  runManagedIntelligencePilot,
} from "../lib/server/reverse-intelligence-managed-pilot"
import type { LiveResearchResult } from "../lib/server/live-research"

const research: LiveResearchResult = {
  query: "latest agent platform changes",
  topic: "news",
  researchedAt: "2026-10-05T20:00:00.000Z",
  providerRequestId: "req-test",
  sources: [
    {
      title: "Example release",
      url: "https://example.com/release",
      snippet: "Example provider launched a new managed agent capability.",
      score: 0.9,
      publishedDate: "2026-10-05",
    },
  ],
}

test("managed intelligence pilot fails closed unless explicitly enabled with a key", async () => {
  const emptyEnv: NodeJS.ProcessEnv = { NODE_ENV: "test" }
  assert.equal(isManagedIntelligencePilotConfigured(emptyEnv), false)

  await assert.rejects(
    () => runManagedIntelligencePilot(research, emptyEnv),
    /MANAGED_INTELLIGENCE_NOT_CONFIGURED/,
  )
})

test("managed intelligence pilot creates a synthesis-only Agents API session and returns completed output", async () => {
  const seen: Array<{ url: string; method: string; body: Record<string, unknown> | null }> = []
  let call = 0

  const fakeFetch: typeof fetch = async (input, init) => {
    call += 1
    const url = String(input)
    const method = init?.method ?? "GET"
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null
    seen.push({ url, method, body })

    const headers = new Headers(init?.headers)
    assert.equal(headers.get("authorization"), "Bearer sk-test")
    assert.equal(headers.get("openai-beta"), "agents=v1")

    if (call === 1) {
      return new Response(JSON.stringify({ id: "sess_123", status: "in_progress" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    if (call === 2) {
      return new Response(
        JSON.stringify({
          data: [{ id: "turn_123", status: "completed", error: null }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    }

    if (call === 3) {
      return new Response(
        JSON.stringify({
          id: "turn_123",
          status: "completed",
          error: null,
          usage: {
            input_tokens: 420,
            input_tokens_details: { cached_tokens: 100 },
            output_tokens: 210,
            output_tokens_details: { reasoning_tokens: 80 },
            total_tokens: 630,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    }

    return new Response(
      JSON.stringify({
        data: [
          {
            id: "msg_1",
            type: "message",
            role: "assistant",
            status: "completed",
            content: [
              {
                type: "output_text",
                text: "What changed: a managed capability launched.\n\nSources: https://example.com/release",
              },
            ],
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )
  }

  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    AMS_MANAGED_INTELLIGENCE_PILOT_ENABLED: "true",
    OPENAI_API_KEY: "sk-test",
    AMS_MANAGED_INTELLIGENCE_POLL_ATTEMPTS: "2",
  }

  const result = await runManagedIntelligencePilot(
    research,
    env,
    fakeFetch,
    async () => {},
  )

  assert.equal(result.sessionId, "sess_123")
  assert.equal(result.turnId, "turn_123")
  assert.equal(result.model, "gpt-6.1-sol")
  assert.match(result.outputText, /managed capability launched/)
  assert.ok(result.latencyMs >= 0)
  assert.deepEqual(result.usage, {
    inputTokens: 420,
    cachedInputTokens: 100,
    outputTokens: 210,
    reasoningTokens: 80,
    totalTokens: 630,
  })

  const createBody = seen[0]?.body as {
    environment?: { type?: string }
    agent?: { model?: string; tools?: unknown; multi_agent?: unknown }
    input?: string
    stream?: boolean
  }

  assert.equal(seen[0]?.url, "https://api.openai.com/v1/agents/sessions")
  assert.equal(seen[0]?.method, "POST")
  assert.equal(
    seen[2]?.url,
    "https://api.openai.com/v1/agents/sessions/sess_123/turns/turn_123",
  )
  assert.equal(createBody.environment?.type, "none")
  assert.equal(createBody.agent?.model, "gpt-6.1-sol")
  assert.equal(createBody.agent?.tools, undefined)
  assert.equal(createBody.agent?.multi_agent, undefined)
  assert.equal(createBody.stream, false)
  assert.match(createBody.input ?? "", /Use ONLY the source packets below/)
  assert.match(createBody.input ?? "", /https:\/\/example\.com\/release/)
})

test("managed intelligence pilot fails closed on a failed turn", async () => {
  let call = 0
  const fakeFetch: typeof fetch = async () => {
    call += 1
    if (call === 1) {
      return new Response(JSON.stringify({ id: "sess_failed", status: "in_progress" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    return new Response(
      JSON.stringify({
        data: [{ id: "turn_failed", status: "failed", error: "provider error" }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )
  }

  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    AMS_MANAGED_INTELLIGENCE_PILOT_ENABLED: "true",
    OPENAI_API_KEY: "sk-test",
    AMS_MANAGED_INTELLIGENCE_POLL_ATTEMPTS: "1",
  }

  await assert.rejects(
    () => runManagedIntelligencePilot(research, env, fakeFetch, async () => {}),
    /MANAGED_INTELLIGENCE_TURN_FAILED/,
  )
})
