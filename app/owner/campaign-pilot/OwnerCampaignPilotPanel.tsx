"use client"

import { type FormEvent, useEffect, useRef, useState } from "react"
import Link from "next/link"

type Run = {
  id: string
  input: { channel: string }
  status: string
  creditState: string
  output: { headline: string; body: string } | null
}
type Pilot = {
  input: {
    id: string
    recipient: string
    steps: { subject: string; body: string; dueAt: string }[]
  }
  status: "draft" | "approved" | "stopped"
  sends: { step: number; state: string }[]
  reviewedAt: string | null
}
type ApiResult = {
  ok?: boolean
  code?: string
  runs?: Run[]
  record?: Pilot
}

export default function OwnerCampaignPilotPanel({
  primary, secondary,
}: { primary: string; secondary: string }) {
  const [runs, setRuns] = useState<Run[]>([])
  const [pilot, setPilot] = useState<Pilot | null>(null)
  const [lookup, setLookup] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [reviewConfirmed, setReviewConfirmed] = useState(false)
  const idRef = useRef<string | null>(null)

  useEffect(() => {
    void fetch("/api/content-agent/runs", { cache: "no-store" })
      .then(async response => {
        const body = await response.json().catch(() => ({})) as ApiResult
        if (!response.ok) throw new Error(body.code || "Content history unavailable")
        setRuns((body.runs ?? []).filter(run =>
          run.status === "succeeded" && run.creditState === "committed" &&
          run.input?.channel === "email" && Boolean(run.output),
        ))
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : "Content history unavailable"))
  }, [])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError("")
    try {
      const form = new FormData(event.currentTarget)
      const first = Date.parse(String(form.get("startAt") ?? ""))
      const cadence = Number(form.get("cadenceDays") || 2)
      if (!Number.isFinite(first)) throw new Error("Select a valid future start date.")
      const id = idRef.current ?? crypto.randomUUID()
      idRef.current = id
      const steps = [0, 1, 2].map(index => ({
        subject: String(form.get("subject" + index) || ""),
        body: String(form.get("body" + index) || ""),
        dueAt: new Date(first + index * cadence * 86400000).toISOString(),
      }))
      const response = await fetch("/api/owner/campaigns/pilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id,
          sourceRunId: String(form.get("sourceRunId") || ""),
          recipient: String(form.get("recipient") || ""),
          steps,
        }),
      })
      const result = await response.json().catch(() => ({})) as ApiResult
      if (!response.ok || !result.record) throw new Error(result.code || "Could not save pilot")
      setPilot(result.record)
      setLookup(result.record.input.id)
      idRef.current = null
      setReviewConfirmed(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save pilot")
    } finally { setBusy(false) }
  }

  async function load() {
    if (!lookup.trim()) return
    setBusy(true)
    setError("")
    try {
      const response = await fetch(
        "/api/owner/campaigns/pilot?id=" + encodeURIComponent(lookup.trim()),
        { cache: "no-store" },
      )
      const result = await response.json().catch(() => ({})) as ApiResult
      if (!response.ok || !result.record) throw new Error(result.code || "Pilot not found")
      setPilot(result.record)
      setReviewConfirmed(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load pilot")
    } finally { setBusy(false) }
  }

  async function change(action: "approve" | "stop") {
    if (!pilot || busy) return
    if (action === "approve" && !reviewConfirmed) {
      setError("Read each message and confirm review before approving.")
      return
    }
    setBusy(true)
    setError("")
    try {
      const response = await fetch("/api/owner/campaigns/pilot", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: pilot.input.id,
          action,
          ...(action === "approve" ? { reviewed: true } : {}),
        }),
      })
      const result = await response.json().catch(() => ({})) as ApiResult
      if (!response.ok || !result.record) throw new Error(result.code || "Could not update pilot")
      setPilot(result.record)
      setReviewConfirmed(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update pilot")
    } finally { setBusy(false) }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-7">
      <Link className="text-sm underline" href="/owner/scheduled-tasks">Back to owner tasks</Link>
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">AMS Owner Campaign Pilot</h1>
        <p className="text-muted-foreground">Build an exact three-email rehearsal using a successful AMS email-generation run.</p>
        <div className="rounded-lg border border-amber-500/40 p-4 text-sm">
          <strong>Review-only; sending is OFF.</strong> This page never sends an email or starts a background schedule.
          Only the two owner-controlled test inboxes are eligible. Approval means the copy was reviewed,
          not that sending has been activated. Customer campaigns are not enabled.
        </div>
      </header>

      {error ? <div role="alert" className="rounded border p-3 text-sm">{error}</div> : null}
      <section className="rounded-lg border p-5">
        <h2 className="mb-4 text-xl font-semibold">Prepare the campaign</h2>
        <form className="space-y-4" onSubmit={save} onChange={() => { idRef.current = null }}>
          <label className="block space-y-1 text-sm">Use an existing completed email draft
            <select className="w-full rounded border bg-background p-3" name="sourceRunId" required>
              <option value="">Select saved generation</option>
              {runs.map(run => <option key={run.id} value={run.id}>
                {run.output?.headline || run.id} ({run.id.slice(-8)})
              </option>)}
            </select>
          </label>
          {!runs.length ? <p className="text-sm">Generate an email draft first through the <Link href="/email-campaign-agent" className="underline">Email Campaign Agent</Link> or <Link href="/nurture-agent" className="underline">Nurture Agent</Link>.</p> : null}
          <label className="block space-y-1 text-sm">Owner-controlled test inbox
            <select required name="recipient" className="w-full rounded border bg-background p-3">
              <option value="">Choose a test recipient</option>
              {primary ? <option value={primary}>{primary} (primary)</option> : null}
              {secondary && secondary !== primary ? <option value={secondary}>{secondary} (secondary)</option> : null}
            </select>
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block space-y-1 text-sm">First planned send date (preview only)
              <input required type="datetime-local" name="startAt" className="w-full rounded border bg-background p-3" />
            </label>
            <label className="block space-y-1 text-sm">Days between steps
              <select name="cadenceDays" className="w-full rounded border bg-background p-3">
                <option value="1">1</option><option value="2">2</option><option value="3">3</option>
              </select>
            </label>
          </div>
          {[0, 1, 2].map(index => (
            <fieldset key={index} className="space-y-3 rounded-lg border p-4">
              <legend className="px-1 font-semibold">Message {index + 1}</legend>
              <label className="block space-y-1 text-sm">Exact reviewed subject
                <input required minLength={3} maxLength={120} name={"subject" + index} className="w-full rounded border bg-background p-3" placeholder={"AMS test email " + (index + 1)} />
              </label>
              <label className="block space-y-1 text-sm">Exact reviewed plain-text body
                <textarea required minLength={10} maxLength={4000} rows={4} name={"body" + index} className="w-full rounded border bg-background p-3" placeholder="Write the reviewed, owner-only rehearsal message" />
              </label>
            </fieldset>
          ))}
          <button type="submit" disabled={busy || runs.length === 0}
            className="rounded-md bg-primary px-5 py-3 font-semibold text-primary-foreground disabled:opacity-50">
            Save private campaign preview
          </button>
        </form>
      </section>
      <section className="rounded-lg border p-5">
        <h2 className="mb-3 text-xl font-semibold">Review saved pilot</h2>
        <div className="flex flex-wrap gap-2">
          <input aria-label="Pilot ID" placeholder="Saved pilot ID" value={lookup}
            onChange={event => setLookup(event.target.value)}
            className="min-w-0 flex-1 rounded border bg-background p-3" />
          <button disabled={busy} onClick={() => void load()} className="rounded border px-4 py-2">Load</button>
        </div>
        {pilot ? <div className="mt-5 space-y-3">
          <p className="text-sm"><strong>Status:</strong> {pilot.status} · no delivery activated</p>
          <p className="break-all text-xs">Pilot ID: {pilot.input.id}</p>
          <p className="text-sm">Recipient: {pilot.input.recipient}</p>
          {pilot.input.steps.map((step, index) => <article key={index} className="rounded border p-4">
            <h3 className="font-semibold">Step {index + 1}: {step.subject}</h3>
            <p className="mt-1 text-xs text-muted-foreground">Proposed date: {new Date(step.dueAt).toLocaleString()}</p>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm">{step.body}</p>
          </article>)}
          {pilot.status === "draft" ? <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={reviewConfirmed} onChange={event => setReviewConfirmed(event.target.checked)} />
            I have reviewed all three messages, the test recipient and the planned dates.
          </label> : null}
          <div className="flex flex-wrap gap-2">
            {pilot.status === "draft" ?
              <button disabled={busy || !reviewConfirmed} onClick={() => void change("approve")} className="rounded border px-4 py-2 disabled:opacity-50">Mark reviewed</button> : null}
            {pilot.status !== "stopped" ?
              <button disabled={busy} onClick={() => void change("stop")} className="rounded border px-4 py-2 disabled:opacity-50">Stop pilot</button> : null}
          </div>
        </div> : null}
      </section>
    </main>
  )
}
