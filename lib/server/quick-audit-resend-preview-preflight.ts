/**
 * Read-only diagnostics for the AMS Resend owner-only Preview.
 *
 * This code does not connect to Redis, call Stripe, issue Resend mail, or
 * refresh Resend admin credentials. It is used before connecting the
 * existing fail-closed delivery worker and never unlocks sending.
 */
import { AMS_RESEND_DOMAIN_ID } from "./quick-audit-resend-domain-proof"

export const RESEND_PREVIEW_BRANCH = "feat/ams-resend-transactional-preview-20261023"
export const RESEND_PREVIEW_REDIS_HOST = "accepted-quetzal-206056.upstash.io"
const scopedNamespace = /^ams:preview:quick-audit:[a-z0-9-]{8,80}:$/u

function nonempty(value: string | undefined): boolean {
  return Boolean(value?.trim())
}

function safePreviewRedisUrl(value: string | undefined): boolean {
  if (!value?.trim()) return false
  try {
    const url = new URL(value)
    return url.protocol === "https:" &&
      url.hostname === RESEND_PREVIEW_REDIS_HOST &&
      url.username === "" && url.password === "" &&
      (url.port === "" || url.port === "443") &&
      url.pathname === "/" && url.search === "" && url.hash === ""
  } catch { return false }
}

export type ResendPreviewPreflight = Readonly<{
  status: "configuration-ready" | "blocked"
  checks: Readonly<Record<
    | "previewEnvironment" | "expectedGitBranch" | "deliveryDisabled"
    | "restrictedSendingKeyPresent" | "resendDomainIdPresent"
    | "ownerSessionConfigured" | "ownerTestRecipientPresent"
    | "previewProofStoreConfigured" | "previewStoreNamespaceValid"
    | "knownPreviewStoreEndpoint" | "notUsingDefaultProductionStore",
    boolean
  >>
  /** These require independent operational proof, never an env true/false flag. */
  remainingEvidence: readonly [
    "OWNER_AUTHENTICATED_PROOF_WRITER",
    "PREVIEW_PROOF_STORE_READ_WRITE",
    "STRIPE_WEBHOOK_ISOLATION",
    "OWNER_ONLY_DISPATCHER",
    "OWNER_INBOX_RECEIPT_AND_AUTHENTICATION"
  ]
}>

export function inspectResendPreviewPreflight(
  env: NodeJS.ProcessEnv = process.env,
): ResendPreviewPreflight {
  const previewUrl = env.AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_URL?.trim()
  const defaultRedisUrl = env.UPSTASH_REDIS_REST_URL?.trim() ??
    env.KV_REST_API_URL?.trim()
  const checks = {
    previewEnvironment: env.VERCEL_ENV === "preview",
    expectedGitBranch: env.VERCEL_GIT_COMMIT_REF === RESEND_PREVIEW_BRANCH,
    deliveryDisabled: env.AMS_QUICK_AUDIT_DELIVERY_SEND_ENABLED !== "true",
    restrictedSendingKeyPresent: nonempty(env.AMS_RESEND_SEND_API_KEY),
    resendDomainIdPresent: env.AMS_RESEND_DOMAIN_ID === AMS_RESEND_DOMAIN_ID,
    ownerSessionConfigured: nonempty(env.AMS_OWNER_EMAIL),
    ownerTestRecipientPresent: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      env.AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL?.trim() ?? "",
    ),
    previewProofStoreConfigured: nonempty(previewUrl) &&
      nonempty(env.AMS_QUICK_AUDIT_RESEND_PROOF_REDIS_REST_TOKEN),
    previewStoreNamespaceValid: scopedNamespace.test(
      env.AMS_QUICK_AUDIT_RESEND_PROOF_NAMESPACE ?? "",
    ),
    knownPreviewStoreEndpoint: safePreviewRedisUrl(previewUrl),
    notUsingDefaultProductionStore: !defaultRedisUrl ||
      (!!previewUrl && previewUrl !== defaultRedisUrl),
  } as const

  return {
    status: Object.values(checks).every(Boolean)
      ? "configuration-ready" : "blocked",
    checks,
    remainingEvidence: [
      "OWNER_AUTHENTICATED_PROOF_WRITER",
      "PREVIEW_PROOF_STORE_READ_WRITE",
      "STRIPE_WEBHOOK_ISOLATION",
      "OWNER_ONLY_DISPATCHER",
      "OWNER_INBOX_RECEIPT_AND_AUTHENTICATION",
    ],
  }
}
