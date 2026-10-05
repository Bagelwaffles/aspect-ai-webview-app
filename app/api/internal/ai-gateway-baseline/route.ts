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
  "Your job is to convert supplied public-source evidence into an operator-ready change brief.",
  "Never claim a release, price, capability, benchmark, integration, or competitive implication that is not supported by the supplied evidence.",
  "Never execute external actions. This test is synthesis-only.",
  "Prefer practical adoption implications, expected leverage, migration risk, and whether existing working AMS systems should remain untouched.",
].join(" ")

const prompt = [
  "Research question: What does OpenAI's Agents API change for AMS architecture?",
  "Research timestamp: 2026-10-05T22:40:00.000Z",
  "",
  "Use ONLY the source packets below as factual evidence.",
  "Do not add facts from memory or unsupported assumptions.",
  "If a conclusion is not supported by the packets, say so explicitly.",
  "",
  "SOURCE 1",
  "Title: Introducing the Agents API",
  "URL: https://openai.com/index/introducing-the-agents-api/",
  "Published: 2026-09-10",
  "Evidence: OpenAI introduced the Agents API in public beta on September 10, 2026, providing a managed Codex harness for long-running cloud agents with context management, tools, subagents, and managed environments.",
  "",
  "SOURCE 2",
  "Title: Agents API quickstart",
  "URL: https://developers.openai.com/api/docs/guides/agents-api/quickstart",
  "Published: unknown",
  "Evidence: The official quickstart creates managed agent sessions through POST /v1/agents/sessions and demonstrates gpt-6-astra with an OpenAI-hosted environment.",
].join("\n")

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return json({ ok: false, code: "NOT_FOUND" }, 404)
  }

  const startedAt = Date.now()

  try {
    const result = await generateText({
      model: "openai/gpt-5.4-mini",
      output: Output.object({ schema: outputSchema }),
      system,
      prompt,
      temperature: 0.4,
      maxOutputTokens: 1_200,
      providerOptions: {
        gateway: {
          models: ["poolside/laguna-s-2.1-free"],
        },
      },
    })

    return json({
      ok: true,
      benchmark: "vercel-ai-gateway-structured-fallback",
      requestedModel: "openai/gpt-5.4-mini",
      fallbackModel: "poolside/laguna-s-2.1-free",
      latencyMs: Date.now() - startedAt,
      output: result.output,
      usage: result.usage,
      finishReason: result.finishReason,
      providerMetadata: result.providerMetadata ?? null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI_GATEWAY_FALLBACK_FAILED"
    return json({ ok: false, code: "AI_GATEWAY_FALLBACK_FAILED", message }, 502)
  }
}
