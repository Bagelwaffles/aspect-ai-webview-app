import { callN8N } from "@/lib/n8n"

export const runtime = "nodejs"

export async function GET() {
  try {
    const result = await callN8N("status.ping", { from: "vo.app" })

    if (result.success) {
      return Response.json({
        ok: true,
        connected: true,
        n8n: result.data ?? null,
      })
    } else {
      return Response.json(
        {
          ok: false,
          connected: false,
          error: result.error ?? "Unknown error",
        },
        { status: 502 },
      )
    }
  } catch (e: any) {
    return Response.json(
      {
        ok: false,
        connected: false,
        error: e.message ?? String(e),
      },
      { status: 502 },
    )
  }
}
