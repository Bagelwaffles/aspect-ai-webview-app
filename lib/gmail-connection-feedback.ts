// Fixed, safe owner-facing feedback. Never render a provider error description.
export const gmailConnectionFeedback = {
  connected: "Gmail account authorized. Run its monitor and verify notification delivery separately.",
  "consent-denied": "Google consent was cancelled. Authorize the account again when ready.",
  "session-required": "Sign in as the AMS owner before authorizing Gmail again.",
  "account-mismatch": "The selected Google account does not match this slot. Choose the expected account.",
  "state-invalid": "The authorization attempt expired or was already used. Start a new authorization.",
  "scope-invalid": "Required Gmail permissions were not granted. Authorize this account again with its required permissions.",
  "offline-grant-required": "Google did not supply an offline grant. Start a new authorization and complete consent.",
  "reauthorize": "Google rejected the grant. Authorize this account again.",
  "configuration-required": "Gmail OAuth configuration requires repair before authorization can finish.",
  "connection-failed": "Gmail authorization could not finish. Try a new authorization after checking configuration.",
} as const
export function gmailCallbackFailure(error: unknown): keyof typeof gmailConnectionFeedback {
  const code = error instanceof Error ? error.message : ""
  switch (code) {
    case "GMAIL_ACCOUNT_MISMATCH": return "account-mismatch"
    case "GMAIL_STATE_INVALID": return "state-invalid"
    case "GMAIL_SCOPE_INVALID": return "scope-invalid"
    case "GMAIL_OFFLINE_GRANT_REQUIRED": return "offline-grant-required"
    case "GMAIL_REAUTHORIZE_REQUIRED": return "reauthorize"
    case "GMAIL_CONFIG_REQUIRED": case "GMAIL_VAULT_REQUIRED": return "configuration-required"
    default: return "connection-failed"
  }
}
