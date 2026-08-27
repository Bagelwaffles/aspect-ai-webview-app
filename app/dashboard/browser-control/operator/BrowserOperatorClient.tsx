"use client"

import Link from "next/link"
import { FormEvent, useEffect, useMemo, useState } from "react"

type OperatorJob = {
  id: string
  action: string
  url: string
  status: string
  risk: string
  selector?: string
  secretRef?: string
}

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  text: string
  job?: OperatorJob | null
}

type WorkerSnapshot = {
  killSwitch: boolean
  worker: null | {
    online: boolean
    version: string
    currentJobId: string | null
  }
}

export default function BrowserOperatorClient() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Tell me what you want done in the dedicated AMS browser. I can open sites, describe pages without reading field values, fill forms, upload approved files, and—with your explicit approval—capture/reuse credentials through the local encrypted vault. Never paste a password, API key, token, or secret into this chat.",
    },
  ])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [rootGoal, setRootGoal] = useState("")
  const [snapshot, setSnapshot] = useState<WorkerSnapshot>({ killSwitch: false, worker: null })

  useEffect(() => {
    let cancelled = false
    async function refresh() {
      const response = await fetch("/api/browser-control/status", { cache: "no-store" })
      if (!response.ok || cancelled) return
      const body = await response.json()
      if (!cancelled) setSnapshot({ killSwitch: Boolean(body.killSwitch), worker: body.worker || null })
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 4_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  const canOperate = Boolean(snapshot.worker?.online) && !snapshot.killSwitch
  const latestJob = useMemo(() => [...messages].reverse().find((message) => message.job)?.job || null, [messages])

  function addMessage(message: Omit<ChatMessage, "id">) {
    setMessages((current) => [...current, { ...message, id: crypto.randomUUID() }])
  }

  async function sendGoal(raw: string) {
    const message = raw.trim()
    if (!message || busy) return
    if (!rootGoal || !/^continue\b/i.test(message)) setRootGoal(message)
    addMessage({ role: "user", text: message })
    setInput("")
    setBusy(true)
    try {
      const response = await fetch("/api/browser-control/operator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      })
      const body = await response.json()
      if (!response.ok) {
        addMessage({ role: "assistant", text: body.error || `Browser Agent failed (${response.status}).` })
        return
      }
      const job = body.job as OperatorJob | null
      const suffix = job
        ? job.status === "awaiting_approval"
          ? `\n\nProposed ${job.action} is waiting for your approval.`
          : `\n\nQueued ${job.action}.`
        : ""
      addMessage({ role: "assistant", text: `${body.reply || "Ready."}${suffix}`, job })
    } catch {
      addMessage({ role: "assistant", text: "Browser Agent request failed before a job could be queued." })
    } finally {
      setBusy(false)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    await sendGoal(input)
  }

  async function approve(job: OperatorJob) {
    setBusy(true)
    try {
      const response = await fetch(`/api/browser-control/jobs/${job.id}/approve`, { method: "POST" })
      const body = await response.json()
      addMessage({
        role: "assistant",
        text: response.ok
          ? `Approved ${job.action}. The Windows worker can execute it now.`
          : body.error || "Approval failed.",
      })
    } finally {
      setBusy(false)
    }
  }

  async function continueGoal() {
    if (!rootGoal) return
    await sendGoal(`Continue this goal: ${rootGoal}. Use the latest Browser Control job results and current page state. Do one safe next step.`)
  }

  return (
    <main className="min-h-screen bg-[#050711] px-4 py-6 text-slate-100 md:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-5xl flex-col">
        <header className="rounded-3xl border border-cyan-400/20 bg-slate-950/90 p-5 md:p-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">AMS // Browser Agent</p>
              <h1 className="mt-2 text-3xl font-black md:text-5xl">Chat with the browser.</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-400">Natural-language control over the owner-approved Windows worker. Credentials stay local and encrypted; chat sees references only.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-black uppercase tracking-wide">
              <span className={`rounded-full border px-3 py-2 ${snapshot.worker?.online ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-rose-400/30 bg-rose-400/10 text-rose-200"}`}>
                {snapshot.worker?.online ? `● Worker ${snapshot.worker.version}` : "○ Worker offline"}
              </span>
              <Link href="/dashboard/browser-control" className="rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-slate-300">Advanced controls</Link>
            </div>
          </div>
        </header>

        <section className="mt-4 flex-1 space-y-4 overflow-y-auto rounded-3xl border border-slate-800 bg-slate-950/70 p-4 md:p-6">
          {messages.map((message) => (
            <article key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[90%] rounded-3xl px-5 py-4 text-sm leading-6 md:max-w-[80%] ${message.role === "user" ? "bg-cyan-300 text-slate-950" : "border border-slate-800 bg-slate-900 text-slate-200"}`}>
                <p className="whitespace-pre-wrap">{message.text}</p>
                {message.job ? (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs">
                    <div className="flex flex-wrap gap-2 font-black uppercase tracking-wide">
                      <span>{message.job.risk}</span>
                      <span>{message.job.status.replaceAll("_", " ")}</span>
                      <span>{message.job.action}</span>
                    </div>
                    <p className="mt-2 break-all opacity-70">{message.job.url}</p>
                    {message.job.secretRef ? <p className="mt-2 text-rose-200">Credential ref: <code>{message.job.secretRef}</code> · raw value stays local</p> : null}
                    {message.job.status === "awaiting_approval" ? (
                      <button disabled={busy} onClick={() => approve(message.job!)} className="mt-3 rounded-xl bg-amber-300 px-4 py-2 font-black text-slate-950 disabled:opacity-50">
                        Approve this action
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </article>
          ))}
          {busy ? <p className="text-sm text-cyan-300">Browser Agent is choosing the next safe action…</p> : null}
        </section>

        <section className="mt-4 rounded-3xl border border-slate-800 bg-slate-950 p-4 md:p-5">
          {!canOperate ? (
            <p className="mb-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-100">
              {!snapshot.worker?.online ? "Browser Worker is offline." : "Browser jobs are stopped by the emergency switch."}
            </p>
          ) : null}
          <form onSubmit={submit} className="flex flex-col gap-3 md:flex-row">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Example: Finish the LinkedIn developer app, securely capture whatever credentials we need, configure Vercel, and stop only when you need my approval or security verification."
              rows={3}
              className="min-h-24 flex-1 resize-none rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-cyan-400"
            />
            <div className="flex gap-2 md:w-44 md:flex-col">
              <button disabled={busy || !input.trim() || !canOperate} type="submit" className="flex-1 rounded-2xl bg-cyan-300 px-4 py-3 font-black text-slate-950 disabled:opacity-40">Send</button>
              <button disabled={busy || !rootGoal || !canOperate} type="button" onClick={continueGoal} className="flex-1 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 font-black text-slate-200 disabled:opacity-40">Continue</button>
            </div>
          </form>
          <div className="mt-3 flex flex-col gap-1 text-xs text-slate-500 md:flex-row md:items-center md:justify-between">
            <p>Never paste passwords, API keys, tokens, client secrets, or MFA codes here.</p>
            <p>{latestJob ? `Latest: ${latestJob.action} · ${latestJob.status.replaceAll("_", " ")}` : "No operator job yet."}</p>
          </div>
        </section>
      </div>
    </main>
  )
}
