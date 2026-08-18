import { NextRequest } from "next/server"

import { browserAdminAuthorized, getBrowserCapture } from "@/lib/server/browser-control"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await browserAdminAuthorized(request))) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { id } = await context.params
  const capture = await getBrowserCapture(id)
  if (!capture) return new Response("Not found", { status: 404 })

  return new Response(new Uint8Array(capture), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="browser-capture-${id}.png"`,
    },
  })
}
