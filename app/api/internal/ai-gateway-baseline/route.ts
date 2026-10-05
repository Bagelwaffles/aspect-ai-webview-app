import { NextResponse } from "next/server"
import { generateText, Output } from "ai"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

const outputSchema = z
  .object({
    whatChanged: z.string().min(1).max(2_000),
    whyItMatters: z.string().min(1).max(2_000),
    recommendedAction: z.enum(["adopt", "test", "monitor", "ignore"]),
    risks: z.array(z.string().min(1).max(500)).max(8),
    sources: z.array(z.string().url()).min(1).max(8),
  })
  .strict()

const system = [
  "You are the internal Reverse-Engineering Intelligence Agent for Aspect Marketing Solutions.",
  "Convert supplied public-source evidence into an operator-ready change brief.",
  "Never add factual claims not supported by the supplied evidence.",
  "Never execute external actions.",
].join(" ")

const prompt = [
  "Research question: What does OpenAI's Agents API change for AMS architecture?",
  "Use ONLY the source packets below as factual evidence.",
  "SOURCE 1",
  "Title: Introducing the Agents API",
  "URL: https://openai.com/index/introducing-the-agents-api/",
  "Published: 2026-09-10",
  "Evidence: OpenAI introduced the Agents API in public beta on September 10, 2026, providing a managed Codex harness for long-running cloud agents with context management, tools, subagents, and managed environments.",
  "SOURCE 2",
  "Title: Agents API quickstart",
  "URL: https://developers.openai.com/api/docs/guides/agents-api/quickstart",
  "Published: unknown",
  "Evidence: The official quickstart creates managed agent sessions through POST /v1/agents/sessions and demonstrates gpt-6-astra with an OpenAI-hosted environment.",
].join("\n")

const candidates = [
  "google/gemini-2.5-flash-lite",
  "openai/gpt-4.1-nano",
] as const

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return json({ ok: false, code: "NOT_FOUND" }, 404)
  }

  const attempts: Array<Record<string, unknown>> = []

  for (const model of candidates) {
    const startedAt = Date.now()
    try {
      const result = await generateText({
        model,
        output: Output.object({ schema: outputSchema }),
        system,
        prompt,
        temperature: 0.4,
        maxOutputTokens: 1_200,
      })

      attempts.push({
        model,
        ok: true,
        latencyMs: Date.now() - startedAt,
        output: result.output,
        usage: result.usage,
        finishReason: result.finishReason,
        providerMetadata: result.providerMetadata ?? null,
      })
      return json({ ok: true, benchmark: "structured-fallback-discovery", winner: model, attempts })
    } catch (error) {
      attempts.push({
        model,
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "UNKNOWN_FAILURE",
      })
    }
  }

  return json({ ok: false, code: "NO_STRUCTURED_FALLBACK_AVAILABLE", attempts }, 503)
}
