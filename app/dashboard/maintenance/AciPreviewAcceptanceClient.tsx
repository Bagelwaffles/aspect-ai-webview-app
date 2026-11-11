"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import {
  runAciPreviewAcceptance,
  type AciPreviewAcceptanceResult,
  type AciPreviewAcceptanceStep,
} from "@/lib/maintenance/preview-acceptance"

const labels: Record<AciPreviewAcceptanceStep, string> = {
  record: "Record one public research finding",
  readback: "Read persisted finding from Preview Redis",
  replay: "Replay identical finding and confirm deduplication",
  dedupe_readback: "Confirm one finding remains indexed",
  attach_pr: "Attach existing Draft PR #328 and exact head",
  verify_checks: "Verify Reconciliation CI and Secret Scan",
  final_readback: "Read final checks_passed state",
}

const orderedSteps: AciPreviewAcceptanceStep[] = [
  "record",
  "readback",
  "replay",
  "dedupe_readback",
  "attach_pr",
  "verify_checks",
  "final_readback",
]

export default function AciPreviewAcceptanceClient() {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [activeStep, setActiveStep] = useState<AciPreviewAcceptanceStep | null>(null)
  const [completedSteps, setCompletedSteps] = useState<AciPreviewAcceptanceStep[]>([])
  const [result, setResult] = useState<AciPreviewAcceptanceResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function runAcceptance() {
    if (running) return
    setRunning(true)
    setActiveStep(null)
    setCompletedSteps([])
    setResult(null)
    setError(null)
    try {
      const outcome = await runAciPreviewAcceptance({
        onStep(step) {
          setActiveStep(step)
          setCompletedSteps((previous) => {
            const index = orderedSteps.indexOf(step)
            return orderedSteps.slice(0, index).filter((item) => previous.includes(item) || item !== step)
          })
        },
      })
      setCompletedSteps(orderedSteps)
      setActiveStep(null)
      setResult(outcome)
      router.refresh()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "ACI_PREVIEW_ACCEPTANCE_FAILED"
      setError(message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-violet-500/40 bg-violet-500/5 p-5" aria-labelledby="aci-preview-acceptance-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-600">Owner-only · Preview branch</p>
          <h2 id="aci-preview-acceptance-title" className="text-xl font-semibold">ACI persistence acceptance</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            One click runs the approved public-research write, Redis readback, idempotent replay,
            Draft PR attachment, exact-head checks, and final readback through the existing owner API.
          </p>
        </div>
        <span className="rounded-md border px-2 py-1 text-xs font-semibold">Preview only</span>
      </div>

      <div className="rounded-lg border bg-background/70 p-3 text-sm">
        <p className="font-medium">Fixed test scope</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Public OpenAI trace-grading documentation only; no customer or private data.</li>
          <li>Existing Preview Redis namespace and existing owner-authenticated API.</li>
          <li>Existing Draft PR #328 at the pinned commit; no new PR is created.</li>
          <li>No model call, cron activation, purchase, merge, deployment, or publication.</li>
        </ul>
      </div>

      <ol className="grid gap-2 sm:grid-cols-2">
        {orderedSteps.map((step, index) => {
          const done = completedSteps.includes(step)
          const active = activeStep === step
          return (
            <li key={step} className="flex items-center gap-2 rounded-md border bg-background/60 px-3 py-2 text-sm">
              <span aria-hidden="true" className={done ? "font-bold text-green-600" : active ? "font-bold text-violet-600" : "text-muted-foreground"}>
                {done ? "✓" : active ? "…" : index + 1}
              </span>
              <span className={done ? "text-foreground" : "text-muted-foreground"}>{labels[step]}</span>
            </li>
          )
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={runAcceptance}
          disabled={running || Boolean(result)}
          className="rounded-lg bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {running ? "Running Preview acceptance…" : result ? "Acceptance completed" : "Run approved Preview acceptance"}
        </button>
        <span className="text-xs text-muted-foreground">
          {running ? "Keep this tab open until the sequence finishes." : "Uses your current signed-in browser session."}
        </span>
      </div>

      {error ? (
        <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/5 p-3 text-sm">
          <p className="font-semibold">Acceptance stopped safely</p>
          <p className="mt-1 font-mono text-xs">{error}</p>
          <p className="mt-1 text-muted-foreground">No later steps were attempted. Refresh the page to inspect persisted state before retrying.</p>
        </div>
      ) : null}

      {result ? (
        <div role="status" aria-live="polite" className="rounded-lg border border-green-600/40 bg-green-600/5 p-4 text-sm">
          <p className="font-semibold text-green-700">Preview acceptance passed</p>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Finding ID</dt><dd className="break-all font-mono text-xs">{result.findingId}</dd></div>
            <div><dt className="text-muted-foreground">First write</dt><dd>{result.firstInsertNew ? "New record" : "Existing idempotent record"}</dd></div>
            <div><dt className="text-muted-foreground">Replay</dt><dd>Duplicate suppressed</dd></div>
            <div><dt className="text-muted-foreground">Final state</dt><dd>{result.finalState}</dd></div>
            <div><dt className="text-muted-foreground">Draft PR</dt><dd><a className="underline" href={result.prUrl} target="_blank" rel="noreferrer">#328</a></dd></div>
            <div><dt className="text-muted-foreground">Checks verified</dt><dd>{result.ciVerifiedAt}</dd></div>
          </dl>
          <p className="mt-3 text-xs font-semibold">Production release remains unauthorized.</p>
        </div>
      ) : null}
    </section>
  )
}
