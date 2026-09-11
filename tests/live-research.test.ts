import assert from "node:assert/strict"
import test from "node:test"

import { isLiveResearchConfigured, runLiveResearch } from "../lib/server/live-research"

const emptyEnv: NodeJS.ProcessEnv = { NODE_ENV: "test" }

test("live research fails closed without provider key", async () => {
  assert.equal(isLiveResearchConfigured(emptyEnv), false)
  await assert.rejects(
    () => runLiveResearch({ query: "current marketing trends", topic: "general", maxResults: 3 }, emptyEnv),
    /LIVE_RESEARCH_NOT_CONFIGURED/,
  )
})

test("live research sends a safe source-only Tavily request and normalizes results", async () => {
  let seenBody: Record<string, unknown> = {}
  let seenAuth = ""

  const fakeFetch: typeof fetch = async (_input, init) => {
    seenAuth = new Headers(init?.headers).get("authorization") ?? ""
    seenBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
    return new Response(
      JSON.stringify({
        request_id: "req-123",
        results: [
          {
            title: "Example source",
            url: "https://example.com/article",
            content: "  Current   source-backed   fact.  ",
            score: 0.9,
            published_date: "2026-09-11",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )
  }

  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", TAVILY_API_KEY: "tvly-test" }
  const result = await runLiveResearch(
    { query: "latest small business marketing update", topic: "news", maxResults: 3 },
    env,
    fakeFetch,
  )

  assert.equal(seenAuth, "Bearer tvly-test")
  assert.equal(seenBody.include_answer, false)
  assert.equal(seenBody.include_raw_content, false)
  assert.equal(seenBody.safe_search, true)
  assert.equal(result.providerRequestId, "req-123")
  assert.equal(result.sources[0]?.snippet, "Current source-backed fact.")
  assert.equal(result.sources[0]?.url, "https://example.com/article")
})
