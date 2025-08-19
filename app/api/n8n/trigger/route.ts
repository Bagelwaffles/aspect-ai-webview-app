import { callN8N, n8nTarget } from "@/lib/n8n"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const target = n8nTarget()
  try {
    const json = await req.json().catch(() => ({}))
    const action = json?.action ?? ""
    if (!action || typeof action !== "string") {
      return Response.json({ ok: false, error: "Missing 'action' string" }, { status: 400 })
    }
    const payload = { ...json }
    delete (payload as any).action

    const data = await callN8N(action, payload)
    return Response.json({ ok: true, result: data, target })
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message ?? String(e), target }, { status: 502 })
  }
}
