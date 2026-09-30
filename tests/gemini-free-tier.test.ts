import assert from "node:assert/strict"
import test from "node:test"
import { z } from "zod"

import {
  DEFAULT_GEMINI_FREE_TIER_MODEL,
  isGeminiFreeTierConfigured,
  runGeminiFreeTierStructured,
} from "../lib/server/gemini-free-tier"

const outputSchema = z.object({
  reply: z.string(),
  state: z.enum(["ready", "blocked"]),
})

const responseSchema = {
  type: "object",
  properties: {
    reply: { type: "string" },
    state: { type: "string", enum: ["ready", "blocked"] },
  },
  required: ["reply", "state"],
}

test("Gemini free-tier runner requires a server-side API key", async () => {
  assert.equal(isGeminiFreeTierConfigured({}), false)
  await assert.rejects(
    runGeminiFreeTierStructured(
      {
        system: "system",
        prompt: "prompt",
        responseSchema,
        outputSchema,
      },
      { env: {} },
    ),
    /BROWSER_OPERATOR_GEMINI_NOT_CONFIGURED/u,
  )
})

test("Gemini free-tier runner sends the API key only in the request header", async () => {
  const calls: Array<{ url: string; headers: Headers; body: string }> = []
  const fetcher = (async (input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: String(init?.body ?? ""),
    })
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify({ reply: "Describe the current page.", state: "ready" }) }],
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )
  }) as typeof fetch

  const result = await runGeminiFreeTierStructured(
    {
      system: "Never expose credentials.",
      prompt: "Choose one safe next action.",
      responseSchema,
      outputSchema,
      temperature: 0.1,
      maxOutputTokens: 300,
    },
    {
      env: { GEMINI_API_KEY: "gemini-test-secret" },
      fetcher,
    },
  )

  assert.deepEqual(result, { reply: "Describe the current page.", state: "ready" })
  assert.equal(calls.length, 1)
  assert.match(calls[0].url, new RegExp(`/${DEFAULT_GEMINI_FREE_TIER_MODEL}:generateContent$`, "u"))
  assert.equal(calls[0].headers.get("x-goog-api-key"), "gemini-test-secret")
  assert.doesNotMatch(calls[0].body, /gemini-test-secret/u)

  const body = JSON.parse(calls[0].body)
  assert.equal(body.generationConfig.responseMimeType, "application/json")
  assert.deepEqual(body.generationConfig.responseJsonSchema, responseSchema)
  assert.equal(body.systemInstruction.parts[0].text, "Never expose credentials.")
})

test("Gemini free-tier runner fails closed on free-tier rate limits", async () => {
  const fetcher = (async () => new Response("rate limited", { status: 429 })) as typeof fetch

  await assert.rejects(
    runGeminiFreeTierStructured(
      {
        system: "system",
        prompt: "prompt",
        responseSchema,
        outputSchema,
      },
      {
        env: { GEMINI_API_KEY: "gemini-test-secret" },
        fetcher,
      },
    ),
    /BROWSER_OPERATOR_GEMINI_RATE_LIMITED/u,
  )
})

test("Gemini free-tier runner rejects malformed structured output", async () => {
  const fetcher = (async () =>
    new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: "not-json" }] } }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch

  await assert.rejects(
    runGeminiFreeTierStructured(
      {
        system: "system",
        prompt: "prompt",
        responseSchema,
        outputSchema,
      },
      {
        env: { GEMINI_API_KEY: "gemini-test-secret" },
        fetcher,
      },
    ),
    /BROWSER_OPERATOR_GEMINI_INVALID_JSON/u,
  )
})
