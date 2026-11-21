"use client"

import { FormEvent, useEffect, useRef, useState } from "react"
import Link from "next/link"

type GeneratedRun = {
  id: string
  input: { channel: string; businessName: string; goal: string }
  status: string
  creditState: string
  output: { headline: string } | null
}
type Plan = {
  id: string
  title: string
  kind: "email-campaign" | "nurture"
  status: "draft" | "reviewed" | "paused"
  sourceRunId: string
  deliveryEnabled: false
  preview: { step: number; dueAt: string; action: "review-only" }[]
}
type Result = { ok?: boolean; plans?: Plan[]; plan?: Plan; runs?: GeneratedRun[]; code?: string }

export default function CampaignAutomationsPage() {
  const [runs, setRuns] = useState<GeneratedRun[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const keyRef = useRef<string | null>(null)

  async function refresh() {
    const [historyRes, plansRes] = await Promise.all([
      fetch("/api/content-agent/runs", { cache: "no-store" }),
      fetch("/api/customer/campaign-automations", { cache: "no-store" }),
    ])
    const history = await historyRes.json().catch(() => ({})) as Result
    const list = await plansRes.json().catch(() => ({})) as Result
    if (!historyRes.ok || !plansRes.ok) {
      throw new Error(list.code || history.code || "Account session or plan storage unavailable")
    }
    setRuns((history.runs || []).filter(
      (r) => r.status === "succeeded" && r.creditState === "committed" &&
        r.input?.channel === "email" && Boolean(r.output),
    ))
    setPlans(list.plans || [])
  }

  useEffect(() => {
    void refresh().catch((error) => setMessage(error instanceof Error ? error.message : "Could not load plans"))
      .finally(() => setLoading(false))
  }, [])

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = new FormData(event.currentTarget)
    const sourceRunId = String(form.get("sourceRunId") || "")
    const startDate = new Date(String(form.get("startAt") || ""))
    if (!sourceRunId || !Number.isFinite(startDate.getTime())) {
      setMessage("Select a completed email run and a valid future start date.")
      return
    }
    const idempotencyKey = keyRef.current || ("customer-plan-" + crypto.randomUUID())
    keyRef.current = idempotencyKey
    setBusy(true)
    setMessage("")
    try {
      const response = await fetch("/api/customer/campaign-automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey,
          kind: String(form.get("kind")),
          title: String(form.get("title")),
          sourceRunId,
          startAt: startDate.toISOString(),
          sequenceLength: Number(form.get("sequenceLength")),
          cadenceDays: Number(form.get("cadenceDays")),
        }),
      })
      const result = await response.json().catch(() => ({})) as Result
      if (!response.ok) throw new Error(result.code || "Could not save draft")
      keyRef.current = null
      await refresh()
      setMessage("Review-only schedule saved. No email was sent or scheduled for sending.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save draft")
    } finally { setBusy(false) }
  }

  async function change(id: string, action: "review" | "pause") {
    if (busy) return
    setBusy(true)
    setMessage("")
    try {
      const response = await fetch("/api/customer/campaign-automations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id, action,
          ...(action === "review" ? { reviewConfirmed: true } : {}),
        }),
      })
      const result = await response.json().catch(() => ({})) as Result
      if (!response.ok) throw new Error(result.code || "Could not update plan")
      await refresh()
      setMessage(action === "review"
        ? "Marked reviewed. External delivery is still disabled."
        : "Plan paused. No messages can be dispatched.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update plan")
    } finally { setBusy(false) }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-7 px-4 py-8">
      <div className="space-y-2">
        <Link href="/agents" className="text-sm underline">← All agents</Link>
        <h1 className="text-3xl font-bold">Email & Nurture Automation Planner</h1>
        <p className="text-muted-foreground">Private, account-scoped schedule previews for completed AMS email drafts.</p>
        <p className="rounded-lg border border-amber-500/40 p-4 text-sm">
          <strong>Review-only mode.</strong> This feature does not connect an email provider,
          enroll contacts, send messages, or run a scheduled worker. Marking a plan reviewed is
          not consent to email recipients or authorization to send. Every step remains disabled
          until an independently verified opt-in, sender connection, unsubscribe/stop-on-reply
          and operator approval system exists.
        </p>
      </div>

      {message ? <p role="status" className="rounded-md border p-3 text-sm">{message}</p> : null}

      <section className="rounded-lg border p-5">
        <h2 className="mb-3 text-xl font-semibold">Create a review-only plan</h2>
        <form onSubmit={create} onChange={() => { keyRef.current = null }} className="space-y-4">
          <label className="block text-sm">Campaign title
            <input required name="title" minLength={3} maxLength={120} className="mt-1 w-full rounded border bg-background p-3" placeholder="Welcome series for new subscribers" />
          </label>
          <label className="block text-sm">Workflow
            <select name="kind" className="mt-1 w-full rounded border bg-background p-3">
              <option value="email-campaign">Email Campaign</option>
              <option value="nurture">Nurture</option>
            </select>
          </label>
          <label className="block text-sm">Verified email draft
            <select required name="sourceRunId" className="mt-1 w-full rounded border bg-background p-3">
              <option value="">Choose a completed run</option>
              {runs.map((run) => <option key={run.id} value={run.id}>{run.output?.headline || run.input.businessName} — {run.id.slice(-8)}</option>)}
            </select>
          </label>
          {runs.length === 0 && !loading ? <p className="text-sm">No recent completed email runs. Create a draft with <Link className="underline" href="/email-campaign-agent">Email Campaign</Link> or <Link className="underline" href="/nurture-agent">Nurture</Link> first.</p> : null}
          <label className="block text-sm">Proposed first review date and time
            <input required type="datetime-local" name="startAt" className="mt-1 w-full rounded border bg-background p-3" />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm">Steps
              <select name="sequenceLength" className="mt-1 w-full rounded border bg-background p-3">
                <option value="3">3</option><option value="5">5</option><option value="7">7</option>
              </select>
            </label>
            <label className="block text-sm">Days between reviews
              <select name="cadenceDays" className="mt-1 w-full rounded border bg-background p-3">
                <option value="1">1</option><option value="2">2</option>
                <option value="3">3</option><option value="7">7</option>
              </select>
            </label>
          </div>
          <button type="submit" disabled={busy || loading || runs.length === 0} className="rounded-md bg-primary px-5 py-3 font-semibold text-primary-foreground disabled:opacity-50">
            Save review-only plan
          </button>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Saved plans</h2>
        {loading ? <p>Loading saved plans…</p> : plans.length === 0 ? <p className="text-muted-foreground">No plans saved yet.</p> : null}
        {plans.map((plan) => (
          <article key={plan.id} className="rounded-lg border p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">{plan.title}</h3>
              <span className="rounded border px-2 py-1 text-xs">{plan.status} · delivery off</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{plan.kind === "nurture" ? "Nurture" : "Email Campaign"} · source {plan.sourceRunId.slice(-8)}</p>
            <ol className="my-4 list-inside list-decimal space-y-1 text-sm">
              {plan.preview.map((step) => <li key={step.step}>Review step {step.step}: {new Date(step.dueAt).toLocaleString()}</li>)}
            </ol>
            <div className="flex flex-wrap gap-3">
              {plan.status === "draft" ? <button disabled={busy} onClick={() => void change(plan.id, "review")} className="rounded border px-3 py-2 text-sm disabled:opacity-50">I reviewed this draft</button> : null}
              {plan.status !== "paused" ? <button disabled={busy} onClick={() => void change(plan.id, "pause")} className="rounded border px-3 py-2 text-sm disabled:opacity-50">Pause plan</button> : null}
            </div>
          </article>
        ))}
      </section>
    </main>
  )
}
