"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

type CloudStatus = {
  enabled: boolean
  configured: boolean
  paired: boolean
  daemon: boolean
  profilePresent?: boolean
}

export default function CloudBrowserLifecycleClient() {
  const [status, setStatus] = useState<CloudStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  const refresh = useCallback(async () => {
    const response = await fetch("/api/internal/browser-control/cloud/status", { cache: "no-store" })
    if (!response.ok) {
      setStatus(null)
      setMessage(`Status check failed (${response.status})`)
      return
    }
    const body = await response.json()
    setStatus({
      enabled: Boolean(body.enabled),
      configured: Boolean(body.configured),
      paired: Boolean(body.paired),
      daemon: Boolean(body.daemon),
      profilePresent: Boolean(body.profilePresent),
    })
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function mutate(path: "stop" | "run") {
    setBusy(true)
    setMessage("")
    try {
      const response = await fetch(`/api/internal/browser-control/cloud/${path}`, { method: "POST" })
      const body = await response.json()
      if (!response.ok) {
        setMessage(body.code || `Cloud browser ${path} failed`)
        return
      }
      setMessage(path === "stop"
        ? "Cloud Sandbox stopped. Persistent filesystem snapshot requested."
        : "Cloud Sandbox resumed and daemon dispatched.")
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#050711] px-4 py-8 text-slate-100 md:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="rounded-3xl border border-cyan-400/20 bg-slate-950 p-6 md:p-8">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">AMS // Cloud Browser Lifecycle</p>
          <h1 className="mt-3 text-3xl font-black md:text-5xl">Stop and resume the persistent Vercel Sandbox.</h1>
          <p className="mt-4 text-sm leading-6 text-slate-400">
            Owner-only lifecycle controls for verifying that the named Sandbox snapshots its filesystem and resumes with the same browser profile. No Browser Control job is created by these buttons.
          </p>
        </header>

        <section className="rounded-3xl border border-slate-800 bg-slate-950 p-6">
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div><span className="text-slate-500">Configured</span><p className="mt-1 font-bold">{status?.configured ? "Yes" : "No"}</p></div>
            <div><span className="text-slate-500">Paired</span><p className="mt-1 font-bold">{status?.paired ? "Yes" : "No"}</p></div>
            <div><span className="text-slate-500">Sandbox daemon</span><p className="mt-1 font-bold">{status?.daemon ? "Active" : "Idle"}</p></div>
            <div><span className="text-slate-500">Persistent profile</span><p className="mt-1 font-bold">{status?.profilePresent ? "Present" : "Not yet detected"}</p></div>
          </div>

          {message ? <p className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-sm text-cyan-100">{message}</p> : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={busy || !status?.configured || !status?.paired}
              onClick={() => void mutate("stop")}
              className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-5 py-3 font-black text-amber-100 disabled:opacity-40"
            >
              Sleep Cloud Worker
            </button>
            <button
              type="button"
              disabled={busy || !status?.configured || !status?.paired}
              onClick={() => void mutate("run")}
              className="rounded-xl bg-cyan-300 px-5 py-3 font-black text-slate-950 disabled:opacity-40"
            >
              Wake Cloud Worker
            </button>
          </div>
        </section>

        <section className="rounded-3xl border border-emerald-400/20 bg-emerald-400/5 p-5 text-sm leading-6 text-emerald-100">
          Use Sleep only when the worker is idle. After Sleep, Wake should restore the same named Sandbox and persistent browser profile.
        </section>

        <Link href="/dashboard/browser-control" className="inline-block font-bold text-cyan-300 underline">
          Back to Browser Control
        </Link>
      </div>
    </main>
  )
}
