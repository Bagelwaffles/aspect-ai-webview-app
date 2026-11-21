"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { CheckCircle2, Download, Loader2, Printer, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  artifactFilename,
  buildBrandedHtmlArtifact,
  downloadHtmlArtifact,
  printHtmlArtifact,
} from "@/lib/client-artifacts"
import type { NativeQuickAuditResult } from "@/lib/server/quick-audit-native"
import { auditEvidenceStatusLabel, summarizeQuickAudit, summarizeQuickAuditEvidence } from "@/lib/quick-audit-presentation"

type ResultState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "processing" }
  | { kind: "completed"; result: NativeQuickAuditResult }
  | { kind: "error"; message: string }

const MAX_AUTOMATIC_CHECKS = 20

function buildAuditArtifact(result: NativeQuickAuditResult): string {
  const summary = summarizeQuickAudit(result)
  const evidence = summarizeQuickAuditEvidence(result.evidence)
  return buildBrandedHtmlArtifact({
    eyebrow: "$49 Quick Marketing Audit",
    title: `${result.businessName} — Marketing Audit`,
    subtitle: `${result.websiteUrl} · Generated ${new Date(result.generatedAt).toLocaleString()}`,
    sections: [
      {
        heading: "Executive Snapshot — Start Here",
        text: `${summary.findingsCount} prioritized findings and ${summary.planDaysCount} day-by-day actions. Based on automated page observations; traffic, ROI, conversions and actual results were not measured.`,
        orderedItems: summary.priorityActions.map((item) => `${item.title}\nSuggested action: ${item.fix}`),
      },
      {
        heading: "What the Automated Page Checks Could Confirm",
        text: `${evidence.detectedCount} signals detected, ${evidence.notDetectedCount} not detected, ${evidence.notVerifiedCount} not verified. These are page-content signals, not independently verified business outcomes or performance metrics. Not detected does not prove absent.`,
        items: evidence.rows.map((item) => `${item.label}: ${auditEvidenceStatusLabel(item.status)}`),
      },
      ...(result.strengths.length
        ? [{ heading: "What the Evidence Already Supports", items: result.strengths }]
        : []),
      {
        heading: "5 Priority Marketing Problems and Fixes",
        orderedItems: result.findings.map((finding) => `${finding.title}\nObservation: ${finding.observation}\nFix: ${finding.fix}`),
      },
      { heading: "Improved Headline", text: result.improvedHeadline },
      { heading: "Improved Offer Direction", text: result.improvedOffer },
      { heading: "Ready-to-Use Promotional Post", text: result.promotionalPost },
      {
        heading: "7-Day Action Plan",
        orderedItems: result.sevenDayPlan.map((item) => `Day ${item.day}: ${item.action}`),
      },
    ],
    footer: `Audit ID ${result.auditId}. This is an evidence-based marketing review, not a guarantee of revenue, rankings, or platform performance. Automated page checks are signals and may not detect every feature on a dynamic site.`,
  })
}

export function QuickAuditResultClient() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("session_id")?.trim() ?? ""
  const [state, setState] = useState<ResultState>({ kind: "idle" })
  const checks = useRef(0)
  const privateReportToken = useRef("")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const checkResult = useCallback(async (manual = false) => {
    if (!sessionId) {
      setState({ kind: "error", message: "This page needs the Stripe checkout session from your payment redirect." })
      return
    }
    if (manual) checks.current = 0
    setState((current) => current.kind === "completed" ? current : { kind: "loading" })
    try {
      const response = await fetch(`/api/quick-marketing-audit/result?session_id=${encodeURIComponent(sessionId)}`, {
        cache: "no-store",
        headers: privateReportToken.current ? { Authorization: `Bearer ${privateReportToken.current}` } : {},
      })
      const body = await response.json().catch(() => null) as {
        ok?: boolean
        status?: string
        result?: NativeQuickAuditResult
        error?: string
      } | null

      if (response.status === 202 && body?.status === "processing") {
        checks.current += 1
        setState({ kind: "processing" })
        if (checks.current < MAX_AUTOMATIC_CHECKS) {
          timer.current = setTimeout(() => void checkResult(false), 3000)
        }
        return
      }

      if (response.ok && body?.status === "completed" && body.result) {
        setState({ kind: "completed", result: body.result })
        return
      }

      setState({ kind: "error", message: body?.error ?? "The audit result could not be verified yet." })
    } catch {
      setState({ kind: "error", message: "The audit result could not be loaded. Your payment record is not changed." })
    }
  }, [sessionId])

  useEffect(() => {
    // The buyer-only access token arrives as a fragment from a transactional
    // email, not as an HTTP request/query parameter. Strip it immediately after
    // capture so it is not retained in browser history or copied links.
    const fragment = window.location.hash
    if (fragment.startsWith("#report_token=")) {
      const token = new URLSearchParams(fragment.slice(1)).get("report_token")
      if (token && token.length <= 2048) privateReportToken.current = token
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search)
    }
    void checkResult(false)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [checkResult])

  if (state.kind === "idle" || state.kind === "loading") {
    return (
      <div className="flex items-center gap-3 rounded-lg border p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        Verifying payment and checking your audit result…
      </div>
    )
  }

  if (state.kind === "processing") {
    return (
      <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center gap-3">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <p className="font-medium">Your paid order is being processed.</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Keep this page open for the automatic refresh. If it takes longer than expected, the button below safely checks the same order again without creating another charge.
        </p>
        {checks.current >= MAX_AUTOMATIC_CHECKS ? (
          <Button onClick={() => void checkResult(true)} variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Check again
          </Button>
        ) : null}
      </div>
    )
  }

  if (state.kind === "error") {
    return (
      <div className="space-y-3 rounded-lg border border-destructive/30 p-4">
        <p className="font-medium">We could not display the result yet.</p>
        <p className="text-sm text-muted-foreground">{state.message}</p>
        <Button onClick={() => void checkResult(true)} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Try again
        </Button>
      </div>
    )
  }

  const { result } = state
  const summary = summarizeQuickAudit(result)
  const evidence = summarizeQuickAuditEvidence(result.evidence)

  function downloadAuditReport() {
    const html = buildAuditArtifact(result)
    downloadHtmlArtifact(artifactFilename(result.businessName, "quick-marketing-audit"), html)
  }

  function printAuditReport() {
    printHtmlArtifact(buildAuditArtifact(result))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-lg border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-medium">Your AMS Quick Marketing Audit is ready.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Audit ID {result.auditId} · Generated {new Date(result.generatedAt).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" size="sm" onClick={downloadAuditReport}>
            <Download className="mr-2 h-4 w-4" />Download report
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={printAuditReport}>
            <Printer className="mr-2 h-4 w-4" />Print / Save PDF
          </Button>
        </div>
      </div>

      <section aria-labelledby="audit-executive-title" className="space-y-5 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-background to-background p-5 sm:p-7">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Your report at a glance</p>
          <h2 id="audit-executive-title" className="text-2xl font-bold tracking-tight">Executive snapshot</h2>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Your report uses website observations to prioritize useful marketing changes.
            Traffic, sales, conversion rates and return on investment were not measured.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border bg-background/85 p-4">
            <p className="text-3xl font-semibold tabular-nums">{summary.findingsCount}</p>
            <p className="mt-1 text-sm text-muted-foreground">Prioritized marketing findings</p>
          </div>
          <div className="rounded-xl border bg-background/85 p-4">
            <p className="text-3xl font-semibold tabular-nums">{summary.planDaysCount}</p>
            <p className="mt-1 text-sm text-muted-foreground">Actions in your day-by-day plan</p>
          </div>
        </div>
        <nav aria-label="Jump to audit sections" className="flex flex-wrap gap-2 text-sm">
          <a className="rounded-lg border bg-background px-3 py-2 underline-offset-4 hover:underline" href="#audit-evidence">Check evidence</a>
          <a className="rounded-lg border bg-background px-3 py-2 underline-offset-4 hover:underline" href="#audit-findings">All findings</a>
          <a className="rounded-lg border bg-background px-3 py-2 underline-offset-4 hover:underline" href="#audit-plan">7-day action plan</a>
          <a className="rounded-lg border bg-background px-3 py-2 underline-offset-4 hover:underline" href="#audit-copy">Copy and offer recommendations</a>
        </nav>
        <div>
          <h3 className="text-base font-semibold">Three actions to start with</h3>
          <ol className="mt-3 space-y-3">
            {summary.priorityActions.map((item) => (
              <li key={item.priority} className="flex gap-3 rounded-xl border bg-background/85 p-3">
                <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">{item.priority}</span>
                <div>
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.fix}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="audit-evidence-title" className="scroll-mt-6 rounded-2xl border p-5 sm:p-7" id="audit-evidence">
        <h2 id="audit-evidence-title" className="text-xl font-semibold">What the automated checks detected</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          These checks examine page signals, not actual visitor behavior or business results.
          A feature marked not detected may still exist on an interactive page; verify it manually before making changes.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3" aria-label="Automated check coverage">
          <div className="rounded-lg border p-3">
            <p className="text-2xl font-semibold tabular-nums">{evidence.detectedCount}</p>
            <p className="text-sm text-muted-foreground">Detected</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-2xl font-semibold tabular-nums">{evidence.notDetectedCount}</p>
            <p className="text-sm text-muted-foreground">Not detected</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-2xl font-semibold tabular-nums">{evidence.notVerifiedCount}</p>
            <p className="text-sm text-muted-foreground">Not verified</p>
          </div>
        </div>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {evidence.rows.map((item) => (
            <li key={item.key} className="rounded-lg border p-3 text-sm">
              <p className="font-medium">{item.label}</p>
              <p className="mt-1 text-muted-foreground">{auditEvidenceStatusLabel(item.status)}</p>
            </li>
          ))}
        </ul>
      </section>

      {result.strengths.length ? (
        <Card>
          <CardHeader><CardTitle>What the evidence already supports</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {result.strengths.map((strength) => <li key={strength}>• {strength}</li>)}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card id="audit-findings">
        <CardHeader><CardTitle>5 priority marketing problems and fixes</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          {result.findings.map((finding, index) => (
            <div className="border-b pb-5 last:border-b-0 last:pb-0" key={`${index}-${finding.title}`}>
              <p className="font-medium">{index + 1}. {finding.title}</p>
              <p className="mt-2 text-sm text-muted-foreground">{finding.observation}</p>
              <p className="mt-2 text-sm"><strong>Fix:</strong> {finding.fix}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div id="audit-copy" className="grid scroll-mt-6 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Improved headline</CardTitle></CardHeader>
          <CardContent><p className="text-sm leading-relaxed">{result.improvedHeadline}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Improved offer direction</CardTitle></CardHeader>
          <CardContent><p className="text-sm leading-relaxed">{result.improvedOffer}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Ready-to-use promotional post</CardTitle></CardHeader>
        <CardContent><p className="whitespace-pre-wrap text-sm leading-relaxed">{result.promotionalPost}</p></CardContent>
      </Card>

      <Card id="audit-plan">
        <CardHeader><CardTitle>7-day action plan</CardTitle></CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm text-muted-foreground">
            {result.sevenDayPlan.map((item) => (
              <li key={item.day}><strong className="text-foreground">Day {item.day}:</strong> {item.action}</li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        This audit is an evidence-based marketing review, not a guarantee of revenue, rankings, or platform performance. Automated page checks are signals and may not detect every feature on a dynamic site.
      </p>
    </div>
  )
}
