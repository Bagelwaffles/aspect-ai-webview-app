import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function enabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true"
}

export async function GET() {
  const liveSecretKeyConfigured = /^(sk|rk)_live_/.test(
    process.env.AMS_STRIPE_QUICK_AUDIT_LIVE_SECRET_KEY?.trim() ?? "",
  )
  const livePriceConfigured = (
    process.env.AMS_STRIPE_QUICK_AUDIT_LIVE_PRICE_ID?.trim() ?? ""
  ).startsWith("price_")
  const liveWebhookConfigured = (
    process.env.AMS_STRIPE_QUICK_AUDIT_LIVE_WEBHOOK_SECRET?.trim().startsWith("whsec_") ?? false
  ) || (
    process.env.AMS_STRIPE_WEBHOOK_MODE?.trim().toLowerCase() === "live" &&
    (process.env.STRIPE_WEBHOOK_SECRET?.trim().startsWith("whsec_") ?? false)
  )
  const redisConfigured = Boolean(
    (process.env.UPSTASH_REDIS_REST_URL?.trim() || process.env.KV_REST_API_URL?.trim()) &&
    (process.env.UPSTASH_REDIS_REST_TOKEN?.trim() || process.env.KV_REST_API_TOKEN?.trim()),
  )
  const salesEnabled = enabled(process.env.AMS_QUICK_AUDIT_PUBLIC_SALES_ENABLED)
  const fulfillmentReady = enabled(process.env.AMS_QUICK_AUDIT_FULFILLMENT_READY)

  const infrastructureReady =
    liveSecretKeyConfigured &&
    livePriceConfigured &&
    liveWebhookConfigured &&
    redisConfigured

  return NextResponse.json(
    {
      ok: true,
      checks: {
        liveSecretKeyConfigured,
        livePriceConfigured,
        liveWebhookConfigured,
        redisConfigured,
        salesEnabled,
        fulfillmentReady,
      },
      infrastructureReady,
      readyToOpen: infrastructureReady && salesEnabled && fulfillmentReady,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  )
}
