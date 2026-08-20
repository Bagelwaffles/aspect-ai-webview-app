"use client"

import { useState } from "react"

export default function QuickAuditTestClient() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function launch() {
    if (busy) return
    setBusy(true)
    setMessage("Creating a Stripe test Checkout Session…")

    try {
      const response = await fetch("/api/internal/quick-audit-test/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
      const body = await response.json().catch(() => null)
      if (!response.ok || !body?.url) {
        setMessage(body?.error ?? "The Stripe test Checkout Session could not be created.")
        setBusy(false)
        return
      }
      setMessage("Opening Stripe test checkout…")
      window.location.assign(body.url)
    } catch {
      setMessage("The Stripe test Checkout Session could not be created.")
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={launch}
        disabled={busy}
        className="inline-flex min-h-12 items-center justify-center rounded-lg bg-emerald-400 px-5 py-3 text-sm font-black uppercase tracking-wider text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Preparing test checkout…" : "Launch $49 test checkout"}
      </button>
      {message ? (
        <p role="status" className="text-sm text-slate-300">
          {message}
        </p>
      ) : null}
    </div>
  )
}
