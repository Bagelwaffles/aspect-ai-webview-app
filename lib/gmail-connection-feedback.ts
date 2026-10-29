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

// Share an explicit allowlist between the owner test endpoint and its UI.
// Never return arbitrary exception messages or Google response bodies.
export const gmailTestFeedback = {
  GMAIL_SEND_DISABLED: "Owner alert sending is disabled in this deployment. The preview needs a READY deployment with sender opt-in before testing delivery.",
  GMAIL_CONNECTION_REQUIRED: "Authorize the primary Gmail account before testing owner alerts.",
  GMAIL_REAUTHORIZE_REQUIRED: "The primary Gmail grant expired or was revoked. Authorize the primary account again.",
  GMAIL_CONFIG_REQUIRED: "Gmail OAuth configuration requires repair before testing owner alerts.",
  GMAIL_VAULT_REQUIRED: "The Gmail credential vault configuration requires repair before testing owner alerts.",
  GMAIL_WEBHOOK_REQUIRED: "The owner alert receiver configuration requires repair before testing delivery.",
  GMAIL_SCOPE_INVALID: "Required primary Gmail permissions are missing. Authorize the primary account again.",
  GMAIL_TOKEN_UNAVAILABLE: "Google token refresh is temporarily unavailable. Delivery has not been confirmed.",
  GMAIL_RECEIPT_UNAVAILABLE: "The primary inbox receipt could not be checked. Delivery has not been confirmed.",
  GMAIL_SEND_UNCONFIRMED: "Google did not confirm the alert submission. Delivery has not been confirmed.",
  GMAIL_TEST_UNCONFIRMED: "Delivery is unconfirmed. Review the connection and sender configuration before retrying.",
} as const
export function gmailTestFailure(error: unknown): keyof typeof gmailTestFeedback {
  const code = error instanceof Error ? error.message : ""
  return Object.hasOwn(gmailTestFeedback, code) ? code as keyof typeof gmailTestFeedback : "GMAIL_TEST_UNCONFIRMED"
}
export function gmailTestDeliveryFeedback(code: unknown) {
  return typeof code === "string" && Object.hasOwn(gmailTestFeedback, code)
    ? gmailTestFeedback[code as keyof typeof gmailTestFeedback]
    : gmailTestFeedback.GMAIL_TEST_UNCONFIRMED
}
