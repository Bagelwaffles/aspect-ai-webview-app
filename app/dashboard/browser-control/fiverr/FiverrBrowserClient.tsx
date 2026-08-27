"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

type FiverrJob = {
  id: string
  action: "open" | "inspect" | "screenshot" | "click" | "fill" | "submit"
  url: string
  risk: "green" | "yellow" | "red"
  status: string
  createdAt: string
  error?: string
  result?: {
    title?: string
    finalUrl?: string
    text?: string
    captureAvailable?: boolean
    durationMs?: number
    ownerAction?: string
  }
}

type Snapshot = {
  configured: boolean
  killSwitch: boolean
  worker: null | {
    id: string
    name: string
    version: string
    platform: string
    browser: string
    lastSeenAt: string
    currentJobId: string | null
    online: boolean
    ageMs: number
  }
  jobs: FiverrJob[]
}

const FIVERR_URL = "https://www.fiverr.com/"

function isFiverrUrl(raw: string) {
  try {
    const host = new URL(raw).hostname.toLowerCase()
    return host === "fiverr.com" || host === "www.fiverr.com"
  } catch {
    return false
  }
}

function badge(value: string) {
  if (["online", "succeeded", "green", "queued"].includes(value)) return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
  if (["running", "yellow", "awaiting_approval"].includes(value)) return "border-amber-400/30 bg-amber-400/10 text-amber-200"
  if (["failed", "red", "offline"].includes(value)) return "border-rose-400/30 bg-rose-400/10 text-rose-200"
  return "border-slate-500/30 bg-slate-500/10 text-slate-300"
}

export default function FiverrBrowserClient() {
  const [snapshot, setSnapshot] = useState<Snapshot>({ configured: false, killSwitch: true, worker: null, jobs: [] })
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const response = await fetch("/api/browser-control/status", { cache: "no-store" })
    if (!response.ok) {
      setMessage(`Browser status failed (${response.status}).`)
      return
    }
    setSnapshot(await response.json())
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 5000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const fiverrJobs = useMemo(
    () => snapshot.jobs.filter((job) => isFiverrUrl(job.url)).slice(0, 10),
    [snapshot.jobs],
  )

  const ready = Boolean(snapshot.configured && snapshot.worker?.online && !snapshot.killSwitch)

  async function queue(action: "open" | "inspect" | "screenshot", note: string) {
    setBusy(true)
    setMessage("")
    try {
      const response = await fetch("/api/browser-control/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, url: FIVERR_URL, note }),
      })
      const body = await response.json()
      if (!response.ok) {
        setMessage(body.error || "Could not queue Fiverr job.")
        return
      }
      setMessage(
        action === "open"
          ? "Fiverr launch queued. Use the dedicated AMS browser window to sign in yourself if Fiverr asks."
          : `${action === "inspect" ? "Read-only inspection" : "Screenshot"} queued. No write action was requested.`,
      )
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const workerState = snapshot.worker?.online ? "online" : "offline"

  return (
    <main className="min-h-screen bg-[#050711] px-4 py-8 text-slate-100 md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-3xl border border-emerald-400/20 bg-slate-950 p-6 md:p-9">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300">AMS // Approved Site 01</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight md:text-6xl">Fiverr control lane.</h1>
              <p className="mt-4 max-w-3xl text-slate-400">
                Phase 1 is intentionally read-only. AMS may open, inspect, and capture Fiverr through the dedicated browser profile. No message send, publish, order change, or account change is offered from this console.
              </p>
            </div>
            <span className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-widest ${badge(workerState)}`}>
              {workerState === "online" ? "● Worker Online" : "○ Worker Offline"}
            </span>
          </div>
        </header>

        {message ? <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 px-5 py-4 text-sm text-cyan-100">{message}</div> : null}

        <section className="grid gap-5 lg:grid-cols-3">
          <article className="rounded-3xl border border-slate-800 bg-slate-950 p-6 lg:col-span-2">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Safe onboarding</p>
            <h2 className="mt-2 text-2xl font-black">Open Fiverr in the AMS profile</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Click the launch button below. If Fiverr asks for a login, enter it directly in the dedicated AMS browser window yourself. Do not put your Fiverr password, recovery code, or two-factor code into AMS, a browser job, or chat.
            </p>
            <button
              type="button"
              onClick={() => void queue("open", "Fiverr phase-1 onboarding launch")}
              disabled={!ready || busy}
              className="mt-6 rounded-xl bg-emerald-300 px-5 py-3 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Open Fiverr safely
            </button>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-950 p-6">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Perimeter</p>
            <h2 className="mt-2 text-2xl font-black">Fiverr first</h2>
            <div className="mt-5 space-y-3 text-sm">
              <p><span className="font-bold text-emerald-300">Allowed:</span> AMS, GitHub infrastructure, Fiverr</p>
              <p><span className="font-bold text-rose-300">Not active yet:</span> Facebook, LinkedIn, Stripe, n8n, YouTube</p>
              <p><span className="font-bold text-amber-300">Write actions:</span> still require the main control room approval path.</p>
            </div>
          </article>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-950 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">Read-only checks</p>
              <h2 className="mt-2 text-2xl font-black">Verify the session before automation</h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-400">Use these only after you have signed in. They gather evidence without clicking, filling, submitting, sending, publishing, purchasing, or changing account settings.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void queue("inspect", "Fiverr phase-1 read-only inspection")}
                disabled={!ready || busy}
                className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm font-black text-cyan-200 disabled:opacity-40"
              >
                Read page text
              </button>
              <button
                type="button"
                onClick={() => void queue("screenshot", "Fiverr phase-1 screenshot proof")}
                disabled={!ready || busy}
                className="rounded-xl border border-violet-400/30 bg-violet-400/10 px-4 py-3 text-sm font-black text-violet-200 disabled:opacity-40"
              >
                Capture screenshot proof
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-950 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-300">Recent Fiverr jobs</p>
              <h2 className="mt-2 text-2xl font-black">Evidence</h2>
            </div>
            <button type="button" onClick={() => void refresh()} className="text-sm font-bold text-cyan-300 underline">Refresh</button>
          </div>

          <div className="mt-5 space-y-3">
            {fiverrJobs.length === 0 ? <p className="text-sm text-slate-500">No Fiverr jobs have run yet.</p> : fiverrJobs.map((job) => (
              <article key={job.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black uppercase ${badge(job.risk)}`}>{job.risk}</span>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black uppercase ${badge(job.status)}`}>{job.status.replaceAll("_", " ")}</span>
                  <strong className="text-xs uppercase tracking-wider">{job.action}</strong>
                </div>
                {job.result?.title ? <p className="mt-3 text-sm"><span className="text-slate-500">Title:</span> {job.result.title}</p> : null}
                {job.result?.text ? <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-black/30 p-3 text-xs text-slate-300">{job.result.text.slice(0, 2500)}</pre> : null}
                {job.result?.ownerAction ? (
                  <p className="mt-3 text-sm text-amber-200">
                    Owner action required: {job.result.ownerAction.replaceAll("_", " ")}
                  </p>
                ) : null}
                {job.error ? <p className="mt-3 text-sm text-rose-300">{job.error}</p> : null}
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                  {job.result?.captureAvailable ? <a href={`/api/browser-control/captures/${job.id}`} target="_blank" rel="noreferrer" className="font-bold text-cyan-300 underline">Open screenshot proof</a> : null}
                  <span className="font-mono text-slate-600">{job.id}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <footer className="flex flex-col gap-3 pb-8 text-sm sm:flex-row sm:items-center sm:justify-between">
          <Link href="/dashboard/browser-control" className="font-bold text-cyan-300 underline">← Main Browser Control</Link>
          <span className="text-xs text-slate-600">Fiverr Phase 1 · read-only first · proof before writes</span>
        </footer>
      </div>
    </main>
  )
}
