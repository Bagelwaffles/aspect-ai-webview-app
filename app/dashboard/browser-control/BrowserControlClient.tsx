"use client"

import { FormEvent, useCallback, useEffect, useState } from "react"

import { BROWSER_ACTIONS, type BrowserAction, type BrowserRisk } from "@/lib/browser-control-policy"

type Job = {
  id: string
  action: BrowserAction
  url: string
  selector?: string
  secretRef?: string
  risk: BrowserRisk
  status: string
  createdAt: string
  error?: string
  result?: {
    title?: string
    finalUrl?: string
    text?: string
    captureAvailable?: boolean
    captureSha256?: string
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
  jobs: Job[]
  audit: Array<{ at: string; type: string; detail: string; jobId?: string }>
}

const EMPTY: Snapshot = { configured: false, killSwitch: true, worker: null, jobs: [], audit: [] }
const INTERACTIVE_ACTIONS: BrowserAction[] = ["click", "fill", "upload", "capture_secret", "fill_secret", "submit"]
const SECRET_ACTIONS: BrowserAction[] = ["capture_secret", "fill_secret"]

function badgeClasses(value: string) {
  if (["online", "succeeded", "green", "queued"].includes(value)) return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
  if (["yellow", "awaiting_approval", "running", "owner_action_required"].includes(value)) return "border-amber-400/30 bg-amber-400/10 text-amber-200"
  if (["red", "failed", "offline"].includes(value)) return "border-rose-400/30 bg-rose-400/10 text-rose-200"
  return "border-slate-500/30 bg-slate-500/10 text-slate-300"
}

export default function BrowserControlPage() {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [commandMessage, setCommandMessage] = useState("")
  const [pairingCode, setPairingCode] = useState("")
  const [action, setAction] = useState<BrowserAction>("screenshot")
  const [url, setUrl] = useState("https://www.aspectmarketingsolutions.app/collaborate")
  const [selector, setSelector] = useState("")
  const [value, setValue] = useState("")
  const [secretRef, setSecretRef] = useState("")
  const [useCurrentPage, setUseCurrentPage] = useState(false)

  const refresh = useCallback(async () => {
    const response = await fetch("/api/browser-control/status", { cache: "no-store" })
    if (!response.ok) {
      setMessage(`Status check failed (${response.status})`)
      setLoading(false)
      return
    }
    setSnapshot(await response.json())
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 5000)
    return () => window.clearInterval(timer)
  }, [refresh])

  async function createPairing() {
    setMessage("")
    const response = await fetch("/api/browser-control/pairing", { method: "POST" })
    const body = await response.json()
    if (!response.ok) return setMessage(body.error || "Could not create pairing code")
    setPairingCode(body.code)
    setMessage("One-time pairing code created. It expires in 10 minutes.")
  }

  async function submitJob(event?: FormEvent) {
    event?.preventDefault()
    setCommandMessage("")
    const payload: Record<string, string | boolean> = { action, url }
    if (selector) payload.selector = selector
    if (action === "fill" || action === "upload") payload.value = value
    if (SECRET_ACTIONS.includes(action) && secretRef) payload.secretRef = secretRef
    if (useCurrentPage && INTERACTIVE_ACTIONS.includes(action)) payload.useCurrentPage = true
    const response = await fetch("/api/browser-control/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const body = await response.json()
    if (!response.ok) {
      setCommandMessage(body.error || "Could not create browser job")
      return
    }
    setCommandMessage(body.job.status === "awaiting_approval" ? "Job created and held for approval." : "Job queued for the browser worker.")
    await refresh()
  }

  async function runProofTest() {
    setAction("screenshot")
    setUrl("https://www.aspectmarketingsolutions.app/collaborate")
    setSelector("")
    setSecretRef("")
    setUseCurrentPage(false)
    const response = await fetch("/api/browser-control/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "screenshot", url: "https://www.aspectmarketingsolutions.app/collaborate", note: "AMS proof test" }),
    })
    const body = await response.json()
    setMessage(response.ok ? "Proof test queued: open Collaboration Hub, read title, capture screenshot." : body.error || "Proof test failed to queue")
    await refresh()
  }

  async function approve(jobId: string) {
    const response = await fetch(`/api/browser-control/jobs/${jobId}/approve`, { method: "POST" })
    const body = await response.json()
    setMessage(response.ok ? "Approved and queued." : body.error || "Approval failed")
    await refresh()
  }

  async function toggleKillSwitch() {
    const disabled = !snapshot.killSwitch
    const response = await fetch("/api/browser-control/kill-switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disabled }),
    })
    const body = await response.json()
    setMessage(response.ok ? (disabled ? "Emergency stop enabled." : "Browser job claiming enabled.") : body.error || "Kill switch update failed")
    await refresh()
  }

  const workerState = snapshot.worker?.online ? "online" : "offline"
  const interactiveAction = INTERACTIVE_ACTIONS.includes(action)
  const secretAction = SECRET_ACTIONS.includes(action)

  return (
    <main className="min-h-screen bg-[#050711] px-4 py-8 text-slate-100 md:px-8">
      <div className="mx-auto max-w-7xl space-y-7">
        <header className="rounded-3xl border border-cyan-400/20 bg-slate-950/80 p-6 shadow-2xl shadow-cyan-950/20 md:p-9">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-300">AMS // Browser Control</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight md:text-6xl">Give AMS a safe pair of hands.</h1>
              <p className="mt-4 max-w-3xl text-slate-400">Owner-controlled browser automation with a dedicated Windows profile, one-time pairing, heartbeat proof, domain allowlists, approvals, captures, audit history, a local encrypted credential vault, and an emergency stop.</p>
            </div>
            <div className={`rounded-full border px-4 py-2 text-sm font-bold uppercase tracking-wider ${badgeClasses(workerState)}`}>
              {workerState === "online" ? "● Worker Online" : "○ Worker Offline"}
            </div>
          </div>
        </header>

        {message ? <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 px-5 py-4 text-sm text-cyan-100">{message}</div> : null}

        <section className="grid gap-5 lg:grid-cols-3">
          <article className="rounded-3xl border border-slate-800 bg-slate-950 p-6 lg:col-span-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Worker heartbeat</p>
                <h2 className="mt-2 text-2xl font-black">{snapshot.worker?.name || "No worker paired yet"}</h2>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase ${badgeClasses(workerState)}`}>{workerState}</span>
            </div>
            {snapshot.worker ? (
              <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
                <div><dt className="text-slate-500">Browser</dt><dd className="mt-1 font-semibold">{snapshot.worker.browser}</dd></div>
                <div><dt className="text-slate-500">Platform</dt><dd className="mt-1 font-semibold">{snapshot.worker.platform}</dd></div>
                <div><dt className="text-slate-500">Version</dt><dd className="mt-1 font-semibold">{snapshot.worker.version}</dd></div>
                <div><dt className="text-slate-500">Last heartbeat</dt><dd className="mt-1 font-semibold">{Math.round(snapshot.worker.ageMs / 1000)} seconds ago</dd></div>
                <div className="sm:col-span-2"><dt className="text-slate-500">Current job</dt><dd className="mt-1 break-all font-mono text-xs">{snapshot.worker.currentJobId || "Idle"}</dd></div>
              </dl>
            ) : (
              <p className="mt-5 text-sm leading-6 text-slate-400">Create a pairing code, run the Windows installer on the AMS workstation, and this card will turn green only after a real heartbeat arrives.</p>
            )}
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-950 p-6">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Emergency control</p>
            <h2 className="mt-2 text-2xl font-black">{snapshot.killSwitch ? "STOPPED" : "ENABLED"}</h2>
            <p className="mt-3 text-sm text-slate-400">The kill switch prevents workers from claiming new jobs. Running jobs still report their result.</p>
            <button onClick={toggleKillSwitch} className={`mt-6 w-full rounded-xl border px-4 py-3 font-bold ${snapshot.killSwitch ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-rose-400/30 bg-rose-400/10 text-rose-200"}`}>
              {snapshot.killSwitch ? "Enable Browser Jobs" : "EMERGENCY STOP"}
            </button>
          </article>
        </section>

        {!snapshot.configured ? (
          <section className="rounded-3xl border border-amber-400/25 bg-amber-400/5 p-6">
            <h2 className="text-xl font-black text-amber-100">Control storage is not configured.</h2>
            <p className="mt-2 text-sm text-amber-100/70">Browser Control uses the same supported Upstash/KV Redis environment variables as the rest of AMS. The UI remains safely offline until durable storage is available.</p>
          </section>
        ) : null}

        <section className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-3xl border border-slate-800 bg-slate-950 p-6">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Pair workstation</p>
            <h2 className="mt-2 text-2xl font-black">One-time pairing. No password sharing.</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">The raw worker token is issued once to the workstation and stored locally. AMS stores only its SHA-256 digest.</p>
            <button onClick={createPairing} disabled={!snapshot.configured} className="mt-5 rounded-xl bg-cyan-300 px-5 py-3 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">Create 10-minute pairing code</button>
            {pairingCode ? (
              <div className="mt-5 rounded-2xl border border-cyan-400/30 bg-cyan-400/5 p-5">
                <p className="text-xs uppercase tracking-widest text-slate-500">Pairing code</p>
                <code className="mt-2 block break-all text-2xl font-black tracking-wider text-cyan-200">{pairingCode}</code>
                <button onClick={() => navigator.clipboard.writeText(pairingCode)} className="mt-3 text-sm font-bold text-cyan-300 underline">Copy code</button>
              </div>
            ) : null}
            <div className="mt-5 rounded-2xl bg-black/30 p-4 text-xs leading-6 text-slate-400">
              <p className="font-bold text-slate-200">Windows install path:</p>
              <code className="mt-2 block break-all">tools/browser-worker/install.ps1</code>
              <p className="mt-2">Approved upload folder: <code>%LOCALAPPDATA%\AMS\BrowserWorker\Uploads</code></p>
              <p className="mt-2">Credential vault: Windows DPAPI CurrentUser encryption. Raw secret values never cross the Browser Control API.</p>
            </div>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-950 p-6">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Proof test</p>
            <h2 className="mt-2 text-2xl font-black">Prove the browser is real.</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">This green task opens the live Collaboration Hub, reads its title, captures a screenshot, and reports evidence back to AMS.</p>
            <button onClick={runProofTest} disabled={!snapshot.worker?.online || snapshot.killSwitch} className="mt-6 w-full rounded-xl bg-emerald-300 px-5 py-3 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">Run harmless proof test</button>
          </article>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-950 p-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-300">Command queue</p>
              <h2 className="mt-2 text-2xl font-black">Create a controlled browser job</h2>
            </div>
            <p className="text-xs text-slate-500">GREEN runs automatically · YELLOW/RED require owner approval</p>
          </div>
          <form onSubmit={submitJob} className="mt-6 grid gap-4 lg:grid-cols-2">
            <label className="text-sm font-semibold text-slate-300">Action
              <select
                value={action}
                onChange={(event) => {
                  const nextAction = event.target.value as BrowserAction
                  setAction(nextAction)
                  if (!INTERACTIVE_ACTIONS.includes(nextAction)) setUseCurrentPage(false)
                  if (!SECRET_ACTIONS.includes(nextAction)) setSecretRef("")
                }}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3"
              >
                {BROWSER_ACTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-300">URL
              <input value={url} onChange={(event) => setUrl(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3" />
            </label>
            {interactiveAction ? (
              <label className="text-sm font-semibold text-slate-300">Selector
                <input value={selector} onChange={(event) => setSelector(event.target.value)} placeholder="role=button:Create app or button[type='submit']" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3" />
                <span className="mt-1 block text-xs font-normal text-slate-500">Supports CSS plus role=, text=, label=, placeholder=, and testid= selectors.</span>
              </label>
            ) : null}
            {action === "fill" || action === "upload" ? (
              <label className="text-sm font-semibold text-slate-300">{action === "upload" ? "Upload filename" : "Value"}
                <input
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder={action === "upload" ? "ams-logo.png" : undefined}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3"
                />
                {action === "upload" ? <span className="mt-1 block text-xs font-normal text-slate-500">File must already be in %LOCALAPPDATA%\AMS\BrowserWorker\Uploads. The worker never accepts arbitrary local paths.</span> : null}
              </label>
            ) : null}
            {secretAction ? (
              <label className="text-sm font-semibold text-slate-300">Secret reference
                <input
                  value={secretRef}
                  onChange={(event) => setSecretRef(event.target.value)}
                  placeholder="linkedin.client_secret"
                  autoComplete="off"
                  className="mt-2 w-full rounded-xl border border-rose-400/30 bg-slate-900 px-4 py-3"
                />
                <span className="mt-1 block text-xs font-normal text-rose-200/70">
                  This is only a label. The raw credential is captured or filled locally on the Windows worker and is never returned to this dashboard, chat, logs, Redis, or screenshots.
                </span>
              </label>
            ) : null}
            {interactiveAction ? (
              <label className="flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100 lg:col-span-2">
                <input type="checkbox" checked={useCurrentPage} onChange={(event) => setUseCurrentPage(event.target.checked)} className="mt-1" />
                <span>
                  <strong>Use current page — preserve form state.</strong>
                  <span className="mt-1 block text-xs font-normal text-amber-100/70">Skips navigation and acts on the page already open in the dedicated AMS browser. The worker verifies that the current page and job URL have the same HTTPS origin.</span>
                </span>
              </label>
            ) : null}
            <div className="lg:col-span-2">
              <button type="submit" disabled={!snapshot.configured} className="rounded-xl bg-violet-300 px-5 py-3 font-black text-slate-950 disabled:opacity-40">Create job</button>
              {commandMessage ? <p className="mt-3 rounded-xl border border-violet-400/20 bg-violet-400/5 px-4 py-3 text-sm text-violet-100">{commandMessage}</p> : null}
            </div>
          </form>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-950 p-6">
          <h2 className="text-2xl font-black">Recent jobs</h2>
          <div className="mt-5 space-y-3">
            {snapshot.jobs.length === 0 ? <p className="text-sm text-slate-500">No browser jobs yet.</p> : snapshot.jobs.map((job) => (
              <article key={job.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black uppercase ${badgeClasses(job.risk)}`}>{job.risk}</span>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black uppercase ${badgeClasses(job.status)}`}>{job.status.replaceAll("_", " ")}</span>
                  <strong className="text-sm uppercase">{job.action}</strong>
                </div>
                <p className="mt-3 break-all text-xs text-slate-400">{job.url}</p>
                {job.secretRef ? <p className="mt-2 text-xs text-rose-200">Credential reference: <code>{job.secretRef}</code> · raw value never stored by AMS</p> : null}
                {job.result?.title ? <p className="mt-3 text-sm"><span className="text-slate-500">Title:</span> {job.result.title}</p> : null}
                {job.result?.ownerAction ? (
                  <p className="mt-3 text-sm text-amber-200">
                    Owner action required: {job.result.ownerAction.replaceAll("_", " ")}
                  </p>
                ) : null}
                {job.error ? <p className="mt-3 text-sm text-rose-300">{job.error}</p> : null}
                <div className="mt-3 flex flex-wrap gap-3 text-xs">
                  {job.status === "awaiting_approval" ? <button onClick={() => approve(job.id)} className="font-bold text-amber-300 underline">Approve this job</button> : null}
                  {job.result?.captureAvailable ? <a href={`/api/browser-control/captures/${job.id}`} target="_blank" rel="noreferrer" className="font-bold text-cyan-300 underline">Open screenshot proof</a> : null}
                  <span className="font-mono text-slate-600">{job.id}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-950 p-6">
          <h2 className="text-2xl font-black">Audit trail</h2>
          <div className="mt-5 space-y-2 font-mono text-xs text-slate-400">
            {snapshot.audit.length === 0 ? <p>No events yet.</p> : snapshot.audit.map((event, index) => (
              <p key={`${event.at}-${index}`}><span className="text-slate-600">{new Date(event.at).toLocaleString()}</span> · <span className="text-cyan-300">{event.type}</span> · {event.detail}</p>
            ))}
          </div>
        </section>

        <p className="pb-8 text-center text-xs text-slate-600">{loading ? "Checking browser control…" : "AMS Browser Control v1.2 · multi-step forms + local encrypted credential vault"}</p>
      </div>
    </main>
  )
}
