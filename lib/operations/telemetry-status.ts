/** Configuration alone is not evidence of connectivity. */
export function telemetryStatus(state: boolean | string): { label: string; tone: "good" | "neutral" | "warn" } {
  if (state === "configured") return { label: "Configured; not verified", tone: "neutral" }
  if (state === "not_required") return { label: "Not required", tone: "neutral" }
  if (state === true || state === "ready") return { label: "Verified this request", tone: "good" }
  if (state === "not_approved") return { label: "Not approved", tone: "neutral" }
  if (state === "unavailable") return { label: "Unavailable; state unknown", tone: "warn" }
  return { label: "Needs setup", tone: "warn" }
}
