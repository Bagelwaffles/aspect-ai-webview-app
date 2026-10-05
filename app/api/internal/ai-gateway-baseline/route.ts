import { NextResponse } from "next/server"
import { generateText } from "ai"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

const system = [
  "You are the internal Reverse-Engineering Intelligence Agent for Aspect Marketing Solutions.",
  "Your job is to convert supplied public-source evidence into an operator-ready change brief.",
  "Never claim a release, price, capability, benchmark, integration, or competitive implication that is not supported by the supplied evidence.",
  "Never execute external actions. This pilot is synthesis-only.",
  "Prefer practical adoption implications, expected leverage, migration risk, and whether existing working AMS systems should remain untouched.",
].join(" ")

const prompt = [
  "Research question: What does OpenAI's Agents API change for AMS architecture?",
  "Research timestamp: 2026-10-05T22:40:00.000Z",
  "",
  "Use ONLY the source packets below as factual evidence.",
  "Do not add facts from memory or unsupported assumptions.",
  "If a conclusion is not supported by the packets, say so explicitly.",
  "Produce a concise AMS intelligence brief with these sections:",
  "1. What changed",
  "2. Why it matters to Aspect Marketing Solutions",
  "3. Recommended action: adopt, test, monitor, or ignore",
  "4. Risks / unknowns",
  "5. Sources, preserving the supplied URLs",
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
      model: "openai/gpt-6.1-sol",
      system,
      prompt,
      temperature: 0.4,
      maxOutputTokens: 1_200,
    })

    return json({
      ok: true,
      benchmark: "vercel-ai-gateway",
      model: "openai/gpt-6.1-sol",
      latencyMs: Date.now() - startedAt,
      text: result.text,
      usage: result.usage,
      finishReason: result.finishReason,
      providerMetadata: result.providerMetadata ?? null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI_GATEWAY_BASELINE_FAILED"
    return json({ ok: false, code: "AI_GATEWAY_BASELINE_FAILED", message }, 502)
  }
}
