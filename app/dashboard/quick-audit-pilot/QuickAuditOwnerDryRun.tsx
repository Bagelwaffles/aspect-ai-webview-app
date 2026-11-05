"use client"

import { useState } from "react"
import { FileSearch, Loader2, ShieldCheck } from "lucide-react"

import type { NativeQuickAuditResult } from "@/lib/server/quick-audit-native"

export function QuickAuditOwnerDryRun() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [report, setReport] = useState<NativeQuickAuditResult | null>(null)

  async function execute() {
    if (busy) return
    setBusy(true)
    setError("")
    setReport(null)
    try {
      const response = await fetch("/api/internal/quick-audit/owner-pilot/dry-run", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
      const payload = await response.json().catch(() => null) as
        | { ok?: boolean; result?: NativeQuickAuditResult }
        | null
      if (!response.ok || !payload?.ok || !payload.result) {
        throw new Error("SELF_AUDIT_NOT_VERIFIED")
      }
      setReport(payload.result)
    } catch {
      setError("The private self-audit could not complete. No payment was created, and no report was saved. Verify the owner Preview access and public-site evidence collector.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-5 rounded-2xl border p-5 sm:p-7" aria-labelledby="dry-run-title">
      <div className="flex items-center gap-2">
        <FileSearch className="h-5 w-5 text-primary" />
        <h2 id="dry-run-title" className="text-xl font-bold">Read-only AMS self-audit</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Inspect the current public AMS homepage with our existing evidence collector.
        No Stripe checkout, Redis writes, customer data or changes to the website.
      </p>
      <button
        type="button"
        onClick={() => void execute()}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-primary/50 bg-primary/10 px-5 py-3 text-sm font-semibold text-foreground hover:bg-primary/20 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
        {busy ? "Checking AMS public website…" : "Run AMS self-audit without payment"}
      </button>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      {report ? (
        <div className="space-y-4" aria-live="polite">
          <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <h3 className="font-semibold">Unreviewed automated draft — {report.generatedAt.slice(0, 10)}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                These are public HTML signals and strategic suggestions, not measurements of AMS leads,
                sales, or traffic. Confirm observations visually before using any finding with customers.
              </p>
            </div>
          </div>
          <ol className="space-y-3">
            {report.findings.map((finding, index) => (
              <li key={index} className="rounded-lg border p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  {finding.basis === "automated-signal" ? "Automated signal · Needs visual verification" : "Strategic suggestion · Not a verified defect"}
                </p>
                <h4 className="mt-2 font-semibold">{index + 1}. {finding.title}</h4>
                <p className="mt-2 text-sm text-muted-foreground">{finding.observation}</p>
                <p className="mt-2 text-sm"><strong>Suggested fix:</strong> {finding.fix}</p>
                {finding.sourceUrl ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Public evidence source: <a className="underline underline-offset-2" href={finding.sourceUrl} target="_blank" rel="noopener noreferrer">AMS website</a>
                    {finding.reviewedAt ? ` · ${finding.reviewedAt.slice(0, 10)}` : ""}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
          <div className="rounded-lg border p-4">
            <h3 className="font-semibold">Seven-day plan</h3>
            <ol className="mt-3 space-y-2">
              {report.sevenDayPlan.map(item => (
                <li className="text-sm" key={item.day}>
                  <strong>Day {item.day}:</strong> {item.action}
                </li>
              ))}
            </ol>
          </div>
          <p className="text-xs text-muted-foreground">
            This report exists only in the current browser session. It is not a verified paid audit,
            not stored as a customer record, and not a proof of successful Stripe webhook fulfillment.
          </p>
        </div>
      ) : null}
    </section>
  )
}
