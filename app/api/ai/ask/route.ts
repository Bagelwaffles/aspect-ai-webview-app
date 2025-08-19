import { askRelevance, relevanceTarget } from "@/lib/relevance"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const { assistantId, message, metadata } = await req.json()

    if (!assistantId || typeof assistantId !== "string") {
      return Response.json({ ok: false, error: "assistantId (string) is required" }, { status: 400 })
    }
    if (!message || typeof message !== "string") {
      return Response.json({ ok: false, error: "message (string) is required" }, { status: 400 })
    }

    const out = await askRelevance({ assistantId, message, metadata })
    return Response.json({ ok: true, data: out, target: relevanceTarget() })
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message ?? String(e), target: relevanceTarget() }, { status: 502 })
  }
}

export async function GET() {
  return Response.json({ ok: true, target: relevanceTarget() })
}
