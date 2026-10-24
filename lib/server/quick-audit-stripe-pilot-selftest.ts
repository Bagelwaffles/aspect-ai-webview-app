/**
 * Owner-triggered synthetic, in-process Preview-only Stripe receipt probe.
 *
 * No Stripe API call, network POST to the webhook, checkout, Resend call, or
 * global feature-switch mutation. The validated branch secret is used only
 * for an ephemeral synthetic raw-body HMAC signature inside this request.
 */
import { createHash, createHmac, randomBytes } from "node:crypto"
import {
  AMS_PILOT_STRIPE_ACCOUNT,
  handlePilotStripeWebhook,
  pilotIntakeConfiguration,
  type PilotEventRedis,
  type PilotReceipt,
} from "./quick-audit-isolated-stripe-pilot"

export type SyntheticProbeRedis = PilotEventRedis & {
  del(key: string): Promise<number>
}

export type SyntheticPilotProbeResult = Readonly<{
  ok: boolean
  code: "SIGNED_SYNTHETIC_RECEIPT_PROBE_PASSED" | "SIGNED_SYNTHETIC_RECEIPT_PROBE_FAILED" | "SIGNED_SYNTHETIC_RECEIPT_PROBE_BLOCKED"
  checks: Readonly<{
    invalidSignatureRejected: boolean
    unsignedRequestRejected: boolean
    signedReceiptStored: boolean
    replayRejected: boolean
    temporaryKeyRemoved: boolean
    deliveryDisabled: boolean
  }>
  stripeOriginVerified: false
  paymentTestPerformed: false
  emailSent: false
}>

function blocked(): SyntheticPilotProbeResult {
  return {
    ok: false,
    code: "SIGNED_SYNTHETIC_RECEIPT_PROBE_BLOCKED",
    checks: {
      invalidSignatureRejected: false, unsignedRequestRejected: false,
      signedReceiptStored: false, replayRejected: false,
      temporaryKeyRemoved: false, deliveryDisabled: false,
    },
    stripeOriginVerified: false, paymentTestPerformed: false, emailSent: false,
  }
}

export async function runOwnerSignedStripePilotProbe(
  env: NodeJS.ProcessEnv,
  redis: SyntheticProbeRedis,
  options: { eventId?: string; now?: () => Date } = {},
): Promise<SyntheticPilotProbeResult> {
  // This probe requires all actual external operations to remain disabled.
  // A local copy of env is used to exercise ONLY the pure receipt handler.
  const off = [
    "AMS_STRIPE_PILOT_WEBHOOK_INTAKE_ENABLED",
    "AMS_STRIPE_PILOT_FULFILLMENT_ENABLED",
    "AMS_QUICK_AUDIT_PILOT_DISPATCH_ENABLED",
    "AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED",
    "AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED",
  ].every(name => env[name] !== "true")
  const isolatedEnv = { ...env, AMS_STRIPE_PILOT_WEBHOOK_INTAKE_ENABLED: "true" }
  if (!off || !pilotIntakeConfiguration(isolatedEnv).ready) return blocked()

  const eventId = options.eventId ?? "evt_" + randomBytes(16).toString("hex")
  if (!/^evt_[a-zA-Z0-9]{8,200}$/u.test(eventId)) return blocked()
  const key = isolatedEnv.AMS_STRIPE_PILOT_REDIS_NAMESPACE! + "event:" + eventId
  const checks = {
    invalidSignatureRejected: false,
    unsignedRequestRejected: false,
    signedReceiptStored: false,
    replayRejected: false,
    temporaryKeyRemoved: false,
    deliveryDisabled: true,
  }
  // Never modify or remove a pre-existing receipt, even if injected eventId
  // collides. The real owner route uses a cryptographically random ID.
  try { if (await redis.get(key) !== null) return blocked() } catch { return blocked() }

  const raw = JSON.stringify({
    id: eventId,
    object: "event",
    type: "checkout.session.completed",
    account: AMS_PILOT_STRIPE_ACCOUNT,
    livemode: false,
    data: { object: { id: "cs_test_synthetic_receipt_only", mode: "payment" } },
  })
  const timestamp = Math.floor((options.now ?? (() => new Date()))().getTime() / 1000)
  const signedPayload = timestamp + "." + raw
  const hash = createHmac("sha256", isolatedEnv.AMS_STRIPE_PILOT_WEBHOOK_SECRET!)
    .update(signedPayload).digest("hex")
  const makeRequest = (signature?: string) => new Request("https://synthetic.invalid/webhook", {
    method: "POST",
    headers: signature ? { "stripe-signature": signature } : undefined,
    body: raw,
  })
  let couldRead = false
  try {
    const unsigned = await handlePilotStripeWebhook(makeRequest(), {
      env: isolatedEnv, store: redis,
    })
    const forged = await handlePilotStripeWebhook(makeRequest(`t=${timestamp},v1=${"0".repeat(64)}`), {
      env: isolatedEnv, store: redis,
    })
    checks.unsignedRequestRejected = unsigned.status === 400
    checks.invalidSignatureRejected = forged.status === 400
    if (!checks.unsignedRequestRejected || !checks.invalidSignatureRejected) {
      throw new Error("SIGNATURE_VALIDATION_BLOCKED")
    }

    const signed = `t=${timestamp},v1=${hash}`
    const first = await handlePilotStripeWebhook(makeRequest(signed), {
      env: isolatedEnv, store: redis,
    })
    const firstBody: unknown = await first.json()
    const stored: unknown = await redis.get(key)
    const parsed: unknown = typeof stored === "string" ? JSON.parse(stored) : stored
    couldRead = true
    checks.signedReceiptStored =
      first.status === 503 && typeof firstBody === "object" &&
      firstBody !== null &&
      (firstBody as { code?: unknown }).code === "PILOT_FULFILLMENT_NOT_ENABLED" &&
      !!parsed && typeof parsed === "object" &&
      (parsed as PilotReceipt).id === eventId &&
      (parsed as PilotReceipt).type === "checkout.session.completed" &&
      (parsed as PilotReceipt).digest === createHash("sha256").update(raw).digest("hex")
    const replay = await handlePilotStripeWebhook(makeRequest(signed), {
      env: isolatedEnv, store: redis,
    })
    const replayBody: unknown = await replay.json()
    checks.replayRejected =
      replay.status === 503 && !!replayBody && typeof replayBody === "object" &&
      (replayBody as { duplicate?: unknown }).duplicate === true &&
      (replayBody as { code?: unknown }).code === "PILOT_FULFILLMENT_NOT_ENABLED"
  } catch {
    // Rejection remains fail-closed. Always attempt to clean up below.
  } finally {
    try {
      await redis.del(key)
      checks.temporaryKeyRemoved = couldRead && (await redis.get(key)) === null
    } catch { checks.temporaryKeyRemoved = false }
  }
  const ok = Object.values(checks).every(Boolean)
  return {
    ok,
    code: ok ? "SIGNED_SYNTHETIC_RECEIPT_PROBE_PASSED" : "SIGNED_SYNTHETIC_RECEIPT_PROBE_FAILED",
    checks,
    stripeOriginVerified: false, paymentTestPerformed: false, emailSent: false,
  }
}
