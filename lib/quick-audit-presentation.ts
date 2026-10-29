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
