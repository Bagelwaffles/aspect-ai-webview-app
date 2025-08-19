import { callN8N, n8nTarget } from "@/lib/n8n"

export const runtime = "nodejs"

export async function GET() {
  const target = n8nTarget()
  try {
    const data = await callN8N("status.ping", { from: "dashboard" })
    return Response.json({ ok: true, n8n: data ?? null, target })
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message ?? String(e), target }, { status: 502 })
  }
}
