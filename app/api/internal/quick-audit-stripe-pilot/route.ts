/**
 * Dedicated Resend Preview branch intake for the new isolated Stripe sandbox.
 *
 * Deliberately inert in current deployment: disabled without separate Redis
 * credentials, endpoint secret and explicit intake flag. Checkout events are
 * never acknowledged as fulfilled or forwarded to production.
 */
import { Redis } from "@upstash/redis"
import { handlePilotStripeWebhook, pilotIntakeConfiguration } from "@/lib/server/quick-audit-isolated-stripe-pilot"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const env = process.env
  const config = pilotIntakeConfiguration(env)
  let store: Redis | null = null
  if (config.ready) {
    const url = env.AMS_STRIPE_PILOT_REDIS_REST_URL!
    const token = env.AMS_STRIPE_PILOT_REDIS_REST_TOKEN!
    try { store = new Redis({ url, token }) } catch { store = null }
  }
  return handlePilotStripeWebhook(request, { env, store })
}

export async function GET() {
  // No endpoint identity, credentials or configuration are exposed publicly.
  return Response.json(
    { ok: false, code: "PILOT_WEBHOOK_POST_ONLY" },
    { status: 405, headers: { "Cache-Control": "no-store", Allow: "POST" } },
  )
}
