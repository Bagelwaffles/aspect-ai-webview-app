"use client"

import { useState } from "react"

type ConnectivityResult = {
  ok?: boolean
  code?: string
  checks?: Record<string, boolean>
}

export function ConnectivityControls() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ConnectivityResult | null>(null)
  const [status, setStatus] = useState<number | null>(null)
  const [error, setError] = useState(false)

  async function run() {
    if (busy) return
    setBusy(true)
    setResult(null)
    setStatus(null)
    setError(false)
    try {
      const res = await fetch("/api/internal/quick-audit-owner-connectivity", {
        method: "POST", credentials: "same-origin", redirect: "error",
        cache: "no-store", headers: { "Content-Type": "application/json" },
        body: "{}",
      })
      setStatus(res.status)
      const json: unknown = await res.json().catch(() => null)
      if (!json || typeof json !== "object" || Array.isArray(json)) throw new Error("invalid result")
      const v = json as Record<string, unknown>
      const checks: Record<string, boolean> = {}
      if (v.checks && typeof v.checks === "object" && !Array.isArray(v.checks)) {
        for (const [name, passed] of Object.entries(v.checks)) {
          if (typeof passed === "boolean") checks[name] = passed
        }
      }
      setResult({ ok: res.ok && v.ok === true, code: typeof v.code === "string" ? v.code : "NO_RESULT", checks })
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/75 p-6">
      <h2 className="text-lg font-semibold">Secure provider connectivity check</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-300">
        Check that the deployed Preview can read the correct isolated Stripe
        sandbox account and reach Resend over HTTPS. Stripe access is read-only;
        Resend receives no API key. No checkout, webhook delivery, domain proof,
        email or feature switch is triggered.
      </p>
      <button type="button" disabled={busy} onClick={() => void run()}
        className="mt-4 rounded-lg border border-cyan-500/60 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-900/40 disabled:opacity-50">
        {busy ? "Testing connectivity..." : "Check Stripe and Resend API access"}
      </button>
      {status !== null && <p className="mt-3 text-xs text-slate-400">HTTP response: {status}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-amber-300">Request unavailable. No network access was verified.</p>}
      {result && <div className="mt-4 space-y-2">
        <p className={result.ok ? "font-semibold text-emerald-300" : "font-semibold text-amber-300"}>
          {result.code}
        </p>
        {Object.entries(result.checks ?? {}).map(([name, passed]) => (
          <p key={name} className={passed ? "text-xs text-emerald-300" : "text-xs text-amber-300"}>
            {passed ? "PASS" : "NO"} — {name.replace(/([a-z])([A-Z])/g, "$1 $2")}
          </p>
        ))}
        <p className="pt-2 text-xs text-slate-400">
          Resend domain API proof and Stripe-origin webhook delivery remain
          unverified regardless of this network check.
        </p>
      </div>}
    </section>
  )
}
