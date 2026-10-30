import type { NativeQuickAuditResult } from "./server/quick-audit-native"

/**
 * Presentation-only summary of verified, already-persisted native-v1 audit data.
 *
 * No invented scores, confidence levels, rankings, traffic, or conversion metrics.
 * The underlying findings already arrive in recommended priority order.
 */
export function summarizeQuickAudit(
  result: Pick<NativeQuickAuditResult, "findings" | "sevenDayPlan">,
) {
  return {
    findingsCount: result.findings.length,
    planDaysCount: result.sevenDayPlan.length,
    priorityActions: result.findings.slice(0, 3).map((finding, index) => ({
      priority: index + 1,
      title: finding.title,
      fix: finding.fix,
    })),
  }
}

/**
 * These are machine-detected page signals, not verified outcomes or performance
 * measurements. In particular, "not detected" is not proof that a feature
 * is absent from an interactive/JavaScript-rendered website.
 */
const AUDIT_SIGNALS = [
  ["hasClearValueProposition", "Clear primary value proposition"],
  ["hasPrimaryCta", "Primary call to action"],
  ["hasLeadCapture", "Email lead-capture form"],
  ["hasTestimonials", "Testimonial or review language"],
  ["hasTitleAndMeta", "Page title and meta description"],
  ["hasContactInfo", "Visible contact path"],
  ["hasPrivacyPolicy", "Privacy policy path"],
  ["hasLocalBusinessSchema", "LocalBusiness structured data"],
] as const

export type AuditEvidenceStatus = "detected" | "not-detected" | "not-verified"

export function summarizeQuickAuditEvidence(
  evidence: NativeQuickAuditResult["evidence"] | null | undefined,
) {
  const rows = AUDIT_SIGNALS.map(([key, label]) => {
    const value = evidence?.[key]
    const status: AuditEvidenceStatus = value === true
      ? "detected"
      : value === false
        ? "not-detected"
        : "not-verified"
    return { key, label, status }
  })

  return {
    rows,
    detectedCount: rows.filter((row) => row.status === "detected").length,
    notDetectedCount: rows.filter((row) => row.status === "not-detected").length,
    notVerifiedCount: rows.filter((row) => row.status === "not-verified").length,
  }
}

export function auditEvidenceStatusLabel(status: AuditEvidenceStatus) {
  if (status === "detected") return "Detected by automated check"
  if (status === "not-detected") return "Not detected by automated check"
  return "Not verified by automated check"
}
