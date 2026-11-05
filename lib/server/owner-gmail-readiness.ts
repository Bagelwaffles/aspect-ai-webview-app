/**
 * Owner-authenticated, read-only Gmail Preview readiness diagnostics.
 * Never return secrets, stored grants, access tokens or exact sender addresses.
 * Connected ChatGPT Gmail tools and inbound Cloudflare routing are NOT AMS grants.
 */
export type GmailPreviewReadiness = {
  preview: boolean
  readyForOwnerAuthorization: boolean
  ownerGrantConnected: boolean
  automatedPilotEnabled: boolean
  missing: string[]
  primaryCallback: string | null
  note: string
}
export function ownerGmailPreviewReadiness(
  env: NodeJS.ProcessEnv = process.env,
  primaryConnected = false,
): GmailPreviewReadiness {
  const preview = env.VERCEL_ENV === "preview"
  const missing: string[] = []
  const requirements = [
    "AMS_GMAIL_CLIENT_ID",
    "AMS_GMAIL_CLIENT_SECRET",
    "AMS_GMAIL_PRIMARY_EMAIL",
    "AMS_GMAIL_SECONDARY_EMAIL",
    "AMS_CONNECTION_ENCRYPTION_KEY",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ] as const
  if (preview) {
    for (const name of requirements) {
      const value = env[name]?.trim()
      if (!value) missing.push(name)
    }
    if (env.AMS_GMAIL_CONSENT_MODE !== "testing" &&
        !(env.AMS_GMAIL_CONSENT_MODE === "approved-owner-use" &&
          env.AMS_GMAIL_POLICY_APPROVED === "true")) {
      missing.push("AMS_GMAIL_CONSENT_MODE")
    }
  }
  let primaryCallback: string | null = null
  try {
    const origin = new URL(env.PUBLIC_APP_URL || env.NEXTAUTH_URL || "")
    if (preview && origin.protocol === "https:" && !origin.username &&
        !origin.password && origin.hostname.endsWith(".vercel.app")) {
      primaryCallback = origin.origin + "/api/owner/gmail/primary/callback"
    }
  } catch {
    // Missing app origin cannot be used for OAuth.
  }
  if (preview && !primaryCallback) missing.push("PUBLIC_APP_URL")
  const readyForOwnerAuthorization = preview && missing.length === 0
  const automatedPilotEnabled = readyForOwnerAuthorization && primaryConnected &&
    env.AMS_GMAIL_SEND_ENABLED === "true" &&
    env.AMS_OWNER_CAMPAIGN_PILOT_ENABLED === "true" &&
    env.AMS_OWNER_CAMPAIGN_AUTOSEND_ENABLED === "true"
  return {
    preview, readyForOwnerAuthorization, ownerGrantConnected: primaryConnected,
    automatedPilotEnabled, missing, primaryCallback,
    note: "Preview OAuth readiness does not authorize a send. A reviewed owner-only pilot also requires campaign-specific consent and a separately authenticated worker.",
  }
}
