"use client"

import { useState } from "react"

type ProbeResult = {
  ok?: boolean
  code?: string
  checks?: Record<string, boolean>
  stripeOriginVerified?: boolean
  paymentTestPerformed?: boolean
  emailSent?: boolean
}

export function StripeReceiptControls() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ProbeResult | null>(null)
  const [httpStatus, setHttpStatus] = useState<number | null>(null)
  const [requestError, setRequestError] = useState(false)

  async function run() {
    if (busy) return
    setBusy(true)
    setRequestError(false)
    setResult(null)
    setHttpStatus(null)
    try {
      const response = await fetch("/api/internal/quick-audit-stripe-pilot-selftest", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        headers: { "content-type": "application/json" },
        body: "{}",
      })
      setHttpStatus(response.status)
      const parsed: unknown = await response.json().catch(() => null)
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setRequestError(true)
      } else {
        const record = parsed as Record<string, unknown>
        const checks: Record<string, boolean> = {}
        if (record.checks && typeof record.checks === "object" && !Array.isArray(record.checks)) {
          for (const [key, value] of Object.entries(record.checks)) {
            if (typeof value === "boolean") checks[key] = value
          }
        }
        setResult({
          ok: response.ok && record.ok === true,
          code: typeof record.code === "string" ? record.code : "NO_CONFIRMED_RESULT",
          checks,
          stripeOriginVerified: record.stripeOriginVerified === true,
          paymentTestPerformed: record.paymentTestPerformed === true,
          emailSent: record.emailSent === true,
        })
      }
    } catch {
      setRequestError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/75 p-6 shadow-lg">
      <h2 className="text-lg font-semibold">Isolated Stripe signed-receipt self-test</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-300">
        Authenticated owner action only. Exercises the deployed Preview
        signature verifier, independent payment Redis receipt, replay rejection,
        and temporary-key cleanup using one synthetic event. It does not contact
        Stripe or verify Stripe-origin webhook delivery. Intake, fulfillment,
        dispatch and email sending remain OFF in Vercel.
      </p>
      <button type="button" onClick={() => void run()} disabled={busy}
        className="mt-4 rounded-lg border border-cyan-500/60 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-900/40 disabled:opacity-50">
        {busy ? "Testing signed receipt..." : "Run owner-only signed receipt self-test"}
      </button>
      {httpStatus !== null && <p className="mt-3 text-xs text-slate-400">HTTP response: {httpStatus}</p>}
      {requestError && <p role="alert" className="mt-3 text-sm text-amber-300">
        Request unavailable; no probe success can be claimed.
      </p>}
      {result && (
        <div className="mt-4 space-y-2" aria-live="polite">
          <p className={result.ok ? "font-semibold text-emerald-300" : "font-semibold text-amber-300"}>
            {result.ok ? "Synthetic Preview receipt probe passed" : "Synthetic Preview receipt probe blocked"}
          </p>
          <p className="text-sm text-slate-300">{result.code}</p>
          {Object.entries(result.checks ?? {}).map(([name, ok]) => (
            <p key={name} className={ok ? "text-xs text-emerald-300" : "text-xs text-amber-300"}>
              {ok ? "PASS" : "BLOCKED"} — {name.replace(/([a-z])([A-Z])/g, "$1 $2")}
            </p>
          ))}
          <p className="pt-2 text-xs text-slate-400">
            Stripe-origin delivery: not tested. Real payment: not performed.
            Email sent: no. This is not a completed Stripe-to-inbox acceptance.
          </p>
        </div>
      )}
    </section>
  )
}
