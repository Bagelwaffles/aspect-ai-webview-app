import { NextRequest, NextResponse } from "next/server"
import { authorizeOwnerApiRequest } from "@/lib/server/owner-api-auth"
import { getOwnedTwitchMetadata, updateOwnedTwitchMetadata, twitchMetadataInputSchema } from "@/lib/server/twitch-pilot"
import { getAutomaticTwitchMetadataStatus } from "@/lib/server/twitch-live-automation"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } }) }
function errorCode(error: unknown) { return error instanceof Error && /^TWITCH_[A-Z_]+$/.test(error.message) ? error.message : "TWITCH_METADATA_UNAVAILABLE" }
export async function GET(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request)
  if (!auth.ok) return json({ ok: false, code: auth.code }, auth.status)
  try { return json({ ok: true, channel: await getOwnedTwitchMetadata(), automation: await getAutomaticTwitchMetadataStatus() }) }
  catch (error) { return json({ ok: false, code: errorCode(error) }, 503) }
}
export async function PATCH(request: NextRequest) {
  const auth = await authorizeOwnerApiRequest(request, { requireTrustedOrigin: true })
  if (!auth.ok) return json({ ok: false, code: auth.code }, auth.status)
  const body = await request.json().catch(() => null)
  const parsed = twitchMetadataInputSchema.safeParse(body)
  if (!parsed.success) return json({ ok: false, code: "TWITCH_METADATA_INPUT_INVALID" }, 400)
  try { return json({ ok: true, channel: await updateOwnedTwitchMetadata(parsed.data) }) }
  catch (error) { return json({ ok: false, code: errorCode(error) }, 503) }
}
