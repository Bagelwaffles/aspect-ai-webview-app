/**
 * Owner-only, non-payment Resend Preview Redis smoke probe.
 * Always bounded, one ephemeral key; never reads or mutates customer/payment keys.
 * No email, no provider API call, no full-access credential.
 */
import { randomBytes, randomUUID } from "node:crypto"
import { inspectResendPreviewPreflight } from "./quick-audit-resend-preview-preflight"

export interface ResendPreviewProbeRedis {
  set(key: string, value: string, options: { nx: true; ex: number }): Promise<unknown>
  get<T = unknown>(key: string): Promise<T | null>
  del(key: string): Promise<number>
}

export async function runOwnerResendPreviewProofStoreProbe(
  redis: ResendPreviewProbeRedis,
  env: NodeJS.ProcessEnv = process.env,
  options: { identifier?: string; marker?: string } = {},
): Promise<boolean> {
  if (inspectResendPreviewPreflight(env).status !== "configuration-ready") return false
  const namespace = env.AMS_QUICK_AUDIT_RESEND_PROOF_NAMESPACE!
  const identifier = options.identifier ?? randomUUID()
  if (!/^[a-z0-9-]{8,80}$/u.test(identifier)) return false
  const key = `${namespace}nonpayment-store-probe:${identifier}`
  const value = options.marker ?? randomBytes(16).toString("hex")
  if (!value || value.length > 128) return false

  let created = false
  let matched = false
  let deleted = false
  try {
    created = (await redis.set(key, value, { nx: true, ex: 45 })) === "OK"
    if (created) matched = (await redis.get<string>(key)) === value
  } catch {
    matched = false
  } finally {
    if (created) {
      try { deleted = (await redis.del(key)) === 1 } catch { deleted = false }
    }
  }
  // Never treat an unremoved key as a successful probe.
  return created && matched && deleted
}
