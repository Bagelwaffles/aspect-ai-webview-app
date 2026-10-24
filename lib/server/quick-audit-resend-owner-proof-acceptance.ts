/**
 * Owner-authorized, one-time Resend Full Access credential verification.
 * The credential is request-scoped: NEVER store, log, return, or put it in
 * Vercel environment variables. Only a 900-second verified-domain proof is
 * saved to the already-isolated Preview proof Redis.
 */
import { Redis } from "@upstash/redis"
import {
  PreviewResendDomainProofStore,
  verifyAndRecordResendDomainForOwner,
  type ResendDomainProofRedis,
} from "./quick-audit-resend-domain-proof-store"
import { inspectResendPreviewPreflight } from "./quick-audit-resend-preview-preflight"

const MUST_BE_OFF = [
  "AMS_STRIPE_PILOT_WEBHOOK_INTAKE_ENABLED",
  "AMS_STRIPE_PILOT_FULFILLMENT_ENABLED",
  "AMS_QUICK_AUDIT_PILOT_DISPATCH_ENABLED",
  "AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED",
  "AMS_QUICK_AUDIT_DELIVERY_OUTBOX_ENABLED",
] as const

type Outcome = Readonly<{
  ok: boolean
  code: "RESEND_ADMIN_PROOF_BLOCKED" | "RESEND_DOMAIN_API_PROOF_REJECTED" |
    "RESEND_DOMAIN_API_PROOF_STORE_FAILED" | "RESEND_DOMAIN_API_PROOF_STORED"
  verifiedByResendApi: boolean
  domainProofTtlSeconds: number
  administrativeKeyStored: false
  administrativeKeyRevoked: false
  revokeAdministrativeKeyNow: boolean
  paymentPerformed: false
  emailSent: false
}>

function result(code: Outcome["code"], ok = false): Outcome {
  return {
    ok, code,
    verifiedByResendApi: ok,
    domainProofTtlSeconds: ok ? 900 : 0,
    administrativeKeyStored: false,
    administrativeKeyRevoked: false,
    revokeAdministrativeKeyNow: ok,
    paymentPerformed: false,
    emailSent: false,
  }
}

export async function runOwnerResendAdminDomainProof(input: {
  env: NodeJS.ProcessEnv
  fullAccessKey: string
  redis?: ResendDomainProofRedis
  fetcher?: typeof fetch
  now?: Date
}): Promise<Outcome> {
  const { env } = input
  if (inspectResendPreviewPreflight(env).status !== "configuration-ready" ||
      MUST_BE_OFF.some(key => env[key] === "true") ||
      !input.fullAccessKey.startsWith("re_") ||
      input.fullAccessKey.length < 20 ||
      input.fullAccessKey.length > 512 ||
      /\s/u.test(input.fullAccessKey)) {
    return result("RESEND_ADMIN_PROOF_BLOCKED")
  }

  try {
    const redis = input.redis ?? new Redis({
      url: env.AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL!,
      token: env.AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_TOKEN!,
    })
    const proofStore = new PreviewResendDomainProofStore(
      redis,
      env.AMS_QUICK_AUDIT_RESEND_PROOF_NAMESPACE!,
      input.now ? () => input.now! : undefined,
    )
    const verified = await verifyAndRecordResendDomainForOwner({
      fullAccessKey: input.fullAccessKey,
      env, proofStore, fetcher: input.fetcher, now: input.now,
    })
    if (!verified) return result("RESEND_DOMAIN_API_PROOF_REJECTED")
    const persisted = await proofStore.readDomainProof()
    if (!persisted) return result("RESEND_DOMAIN_API_PROOF_STORE_FAILED")
    return result("RESEND_DOMAIN_API_PROOF_STORED", true)
  } catch {
    return result("RESEND_DOMAIN_API_PROOF_STORE_FAILED")
  }
}
