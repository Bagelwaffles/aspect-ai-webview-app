import { callN8N } from "@/lib/n8n"
export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    // expected: { name, email, company?, budget?, useCase?, message? }
    if (!body?.email || !body?.name) {
      return Response.json({ ok: false, error: "name and email are required" }, { status: 400 })
    }
    const data = await callN8N("lead.intake", body)
    return Response.json({ ok: true, data })
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message ?? String(e) }, { status: 502 })
  }
}
