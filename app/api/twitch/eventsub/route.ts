import { after, NextRequest, NextResponse } from "next/server"

import { generateStreamIntelligencePackage } from "@/lib/server/stream-intelligence"
import {
  processTwitchEventSubNotification,
  recordTwitchSubscriptionChallenge,
  recordTwitchSubscriptionRevocation,
  resolveTwitchConfig,
  verifyTwitchEventSubSignature,
} from "@/lib/server/twitch-pilot"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function noStore(status: number) {
  return new NextResponse(null, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

export async function POST(request: NextRequest) {
  const config = resolveTwitchConfig()
  if (!config) return noStore(503)

  const rawBody = await request.text()
  const messageId = request.headers.get("twitch-eventsub-message-id")
  const timestamp = request.headers.get("twitch-eventsub-message-timestamp")
  const signature = request.headers.get("twitch-eventsub-message-signature")
  const messageType = request.headers.get("twitch-eventsub-message-type")

  if (!verifyTwitchEventSubSignature(
    { messageId, timestamp, signature, rawBody },
    config.eventSubSecret,
  )) {
    return noStore(403)
  }

  try {
    const body = JSON.parse(rawBody) as { challenge?: unknown }

    if (messageType === "webhook_callback_verification") {
      if (typeof body.challenge !== "string" || !body.challenge) return noStore(400)
      await recordTwitchSubscriptionChallenge(rawBody)
      return new NextResponse(body.challenge, {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8",
        },
      })
    }

    if (messageType === "notification") {
      if (!messageId) return noStore(400)
      const result = await processTwitchEventSubNotification(rawBody, messageId)
      if (!result.duplicate && result.streamId && (result.type === "stream.online" || result.type === "stream.offline")) {
        const phase = result.type === "stream.offline" ? "post-stream" : "live"
        after(async () => {
          try {
            if (phase === "post-stream") {
              await new Promise((resolve) => setTimeout(resolve, 5_000))
            }
            await generateStreamIntelligencePackage({
              streamId: result.streamId!,
              phase,
            })
          } catch (error) {
            console.error("STREAM_INTELLIGENCE_BACKGROUND_FAILED", {
              phase,
              message: error instanceof Error ? error.message : "unknown",
            })
          }
        })
      }
      return noStore(204)
    }

    if (messageType === "revocation") {
      await recordTwitchSubscriptionRevocation(rawBody)
      return noStore(204)
    }

    return noStore(400)
  } catch {
    return noStore(500)
  }
}
