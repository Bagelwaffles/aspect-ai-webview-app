/** User-facing reporting errors. Never echo raw dependency details or advise an automatic retry. */
export function reportingFailureMessage(error: unknown): string {
  const code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "REPORTING_OUTCOME_UNCONFIRMED"
  if (code === "REPORTING_IDENTITY_CONFLICT") {
    return `${code}. Report rejected: this report ID or dedupe key belongs to different content. The existing report was not changed. No automatic retry. Read back the existing report before deciding what to submit.`
  }
  return `${code}. No automatic retry. The write may have succeeded; keep the same report ID and payload for readback or an identical replay. An owner Google session is required for this API.`
}
