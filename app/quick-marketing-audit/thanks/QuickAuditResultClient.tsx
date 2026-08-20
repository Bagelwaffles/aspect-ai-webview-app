"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { CheckCircle2, Loader2, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { NativeQuickAuditResult } from "@/lib/server/quick-audit-native"

type ResultState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "processing" }
  | { kind: "completed"; result: NativeQuickAuditResult }
  | { kind: "error"; message: string }

const MAX_AUTOMATIC_CHECKS = 20

export function QuickAuditResultClient() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("session_id")?.trim() ?? ""
  const [state, setState] = useState<ResultState>({ kind: "idle" })
  const checks = useRef(0)
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
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <p className="font-medium">Your AMS Quick Marketing Audit is ready.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Audit ID {result.auditId} · Generated {new Date(result.generatedAt).toLocaleString()}
          </p>
        </div>
      </div>

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

      <Card>
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

      <div className="grid gap-6 lg:grid-cols-2">
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

      <Card>
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
