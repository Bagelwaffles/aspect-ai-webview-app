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
  enabled?: boolean
  status?: string
}

export default function OwnerCampaignPilotPanel({
  primary, secondary, previewMode,
}: { primary: string; secondary: string; previewMode: boolean }) {
  const [runs, setRuns] = useState<Run[]>([])
  const [pilot, setPilot] = useState<Pilot | null>(null)
  const [lookup, setLookup] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [reviewConfirmed, setReviewConfirmed] = useState(false)
  const [sendConfirmed, setSendConfirmed] = useState(false)
  const [autoScheduleConfirmed, setAutoScheduleConfirmed] = useState(false)
  const [testEnabled, setTestEnabled] = useState(false)
  const [message, setMessage] = useState("")
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
      setMessage("Private review plan saved. No test message has been sent.")
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
      setTestEnabled(result.enabled === true)
      setReviewConfirmed(false)
      setAutoScheduleConfirmed(false)
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
      setMessage(action === "approve" ? "Plan reviewed. Sending remains OFF unless enabled separately in Preview." : "Pilot stopped.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update pilot")
    } finally { setBusy(false) }
  }

  async function authorizeAutoSchedule() {
    if (!pilot || busy || !previewMode || !autoScheduleConfirmed ||
        pilot.status !== "approved" || pilot.sends.length) return
    setBusy(true)
    setError("")
    setMessage("")
    try {
      const response = await fetch("/api/owner/campaigns/pilot/authorize-autosend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: pilot.input.id,
          confirmation: "AUTHORIZE_OWNER_ONLY_PREVIEW_SCHEDULE",
        }),
      })
      const result = await response.json().catch(() => ({})) as ApiResult
      if (!response.ok || result.ok !== true) {
        throw new Error(result.code || "Owner-only schedule authorization unavailable")
      }
      setAutoScheduleConfirmed(false)
      setMessage("Owner-only Preview schedule authorized. This did not send mail or start a worker. Only separately enabled, due Preview jobs may send.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Owner-only schedule authorization unavailable")
    } finally { setBusy(false) }
  }

  async function verifyReceipt() {
    if (!pilot || busy) return
    setBusy(true)
    setMessage("")
    setError("")
    try {
      const response = await fetch("/api/owner/campaigns/pilot/verify-receipt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: pilot.input.id }),
      })
      const result = await response.json().catch(() => ({})) as ApiResult
      if (!response.ok) throw new Error(result.code || result.status || "No matching inbox receipt confirmed.")
      setMessage("Verified the test message in the correct owner inbox. Later steps still require separate approval.")
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Inbox receipt unverified. Do not resend automatically.")
    } finally { setBusy(false) }
  }

  async function sendOneTest() {
    if (!pilot || busy || !testEnabled || !sendConfirmed) return
    setBusy(true)
    setError("")
    setMessage("")
    try {
      const response = await fetch("/api/owner/campaigns/pilot/send-test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: pilot.input.id,
          confirmation: "AUTHORIZE_SINGLE_OWNER_PREVIEW_TEST",
        }),
      })
      const result = await response.json().catch(() => ({})) as ApiResult
      if (!response.ok) throw new Error(result.code || result.status || "Test delivery not confirmed")
      setMessage("Gmail accepted one pilot step. Independent inbox receipt still needs verification.")
      setSendConfirmed(false)
      // Avoid another implicit send. Load only the persisted record state.
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Delivery uncertain. Do not resend automatically.")
    } finally { setBusy(false) }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-7">
      <Link className="text-sm underline" href="/owner/scheduled-tasks">Back to owner tasks</Link>
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">AMS Owner Campaign Pilot</h1>
        <p className="text-muted-foreground">Build an exact three-email rehearsal using a successful AMS email-generation run.</p>
        <div className="rounded-lg border border-amber-500/40 p-4 text-sm">
          <strong>Automatic sending is OFF.</strong> Saving and review never send an email or start a background schedule.
          Only two owner-controlled test inboxes are eligible. A separately enabled Preview test
          requires an additional explicit send confirmation. Customer campaigns are not enabled.
        </div>
      </header>

      {error ? <div role="alert" className="rounded border p-3 text-sm">{error}</div> : null}
      {message ? <div role="status" className="rounded border p-3 text-sm">{message}</div> : null}
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
          <p className="text-sm"><strong>Status:</strong> {pilot.status} · no automated schedule</p>
          <p className="break-all text-xs">Pilot ID: {pilot.input.id}</p>
          <p className="text-sm">Recipient: {pilot.input.recipient}</p>
          {pilot.input.steps.map((step, index) => <article key={index} className="rounded border p-4">
            <h3 className="font-semibold">Step {index + 1}: {step.subject}</h3>
            <p className="mt-1 text-xs text-muted-foreground">Proposed date: {new Date(step.dueAt).toLocaleString()}</p>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm">{step.body}</p>
          </article>)}
          {pilot.sends.length > 0 ? <div className="rounded border p-3 text-sm">
            <strong>Test steps:</strong>
            <ul className="mt-2 space-y-1">
              {pilot.sends.map(sent => <li key={sent.step}>
                Message {sent.step + 1}: {sent.state === "delivered" ? "Verified in inbox" :
                  sent.state === "accepted" ? "Accepted by Gmail, receipt not yet verified" :
                  "Unconfirmed; later steps blocked"}
              </li>)}
            </ul>
          </div> : null}
          {pilot.status === "approved" && pilot.sends.some(sent => sent.state === "accepted") ?
            <button disabled={busy} onClick={() => void verifyReceipt()}
              className="rounded border px-4 py-2 text-sm disabled:opacity-50">
              Verify owner inbox receipt
            </button> : null}
          {pilot.status === "draft" ? <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={reviewConfirmed} onChange={event => setReviewConfirmed(event.target.checked)} />
            I have reviewed all three messages, the test recipient and the planned dates.
          </label> : null}
          {pilot.status === "approved" && testEnabled ? (
            <div className="space-y-2 rounded border border-amber-500/40 p-3">
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" checked={sendConfirmed} onChange={e => setSendConfirmed(e.target.checked)} />
                I explicitly authorize sending only the next due test email to our owner-controlled inbox.
              </label>
              <button disabled={busy || !sendConfirmed} onClick={() => void sendOneTest()}
                className="rounded border px-4 py-2 text-sm disabled:opacity-50">
                Send one approved owner-mailbox test
              </button>
              <p className="text-xs">Gmail API acceptance is not proof of inbox delivery. Unconfirmed sends are not automatically retried.</p>
            </div>
          ) : null}
          {pilot.status === "approved" && pilot.sends.length === 0 && previewMode ? (
            <div className="space-y-2 rounded border border-amber-500/40 p-3">
              <p className="text-sm font-semibold">Optional unattended owner-only Preview test</p>
              <p className="text-xs">Review-only approval does not authorize sending. This requires a second campaign-specific approval, valid Gmail OAuth, and a separately enabled Preview worker. No customer emails.</p>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" checked={autoScheduleConfirmed}
                  onChange={event => setAutoScheduleConfirmed(event.target.checked)} />
                I authorize only this reviewed three-email schedule to our selected owner-controlled test inbox, at the displayed dates.
              </label>
              <button disabled={busy || !autoScheduleConfirmed} onClick={() => void authorizeAutoSchedule()}
                className="rounded border px-4 py-2 text-sm disabled:opacity-50">
                Authorize this Preview schedule
              </button>
            </div>
          ) : null}
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
