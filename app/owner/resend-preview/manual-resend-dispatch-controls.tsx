"use client"

import { useState } from "react"

const REQUEST_ID = /^quick-audit-[A-Za-z0-9_-]{8,190}$/u
const RESPONSE_CODE = /^PILOT_DISPATCH_[A-Z_]{4,60}$/u

/**
 * Manual owner invocation only. No action on page load, no credentials,
 * arbitrary recipient, sender or report in the browser. Server gates all.
 */
export function ManualResendDispatchControls() {
  const [requestId, setRequestId] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function dispatchOnce() {
    const exact = requestId.trim()
    if (busy || attempted || !confirmed || !REQUEST_ID.test(exact)) return
    // A timeout/ambiguous response is NEVER a reason to resubmit.
    setAttempted(true)
    setBusy(true)
    setResult(null)
    try {
      const response = await fetch("/api/internal/quick-audit-pilot-dispatch", {
        method: "POST", credentials: "same-origin", redirect: "error",
        cache: "no-store", referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: exact }),
      })
      const data: unknown = await response.json().catch(() => null)
      const code = data && typeof data === "object" && !Array.isArray(data) &&
        "code" in data && typeof data.code === "string" &&
        RESPONSE_CODE.test(data.code) ? data.code : "PILOT_DISPATCH_RESPONSE_UNCONFIRMED"
      if (response.status === 200 && code === "PILOT_DISPATCH_SUBMITTED" &&
          data && typeof data === "object" && "ok" in data && data.ok === true) {
        setResult("Resend provider submission accepted (HTTP 200). Inbox delivery is NOT proven. Independently verify the owner Gmail inbox and outbox.")
      } else {
        setResult("HTTP " + response.status + " — " + code + ". No safe retry: inspect durable outbox and recipient inbox first.")
      }
    } catch {
      setResult("Dispatch outcome UNKNOWN. Do not retry, even after refreshing. Inspect Resend, outbox and owner inbox before any decision.")
    } finally { setBusy(false) }
  }

  return (
    <section className="rounded-2xl border border-cyan-500/50 bg-slate-900/75 p-6">
      <h2 className="text-lg font-semibold">Manual owner-only Resend TEST delivery</h2>
      <p className="mt-2 text-sm text-slate-300">
        One existing paid Quick Audit, preapproved owner recipient, verified business sender.
        Require fresh Resend domain proof and a separately armed 10-minute Preview window.
        This UI never arms switches, opens Stripe, creates orders, or sends on page load.
      </p>
      <label htmlFor="resend-owner-request-id" className="mt-4 block text-sm">
        Existing queued Quick Audit request ID
      </label>
      <input id="resend-owner-request-id" type="text"
        value={requestId} onChange={event => setRequestId(event.target.value)}
        placeholder="quick-audit-..." autoComplete="off" autoCapitalize="none"
        spellCheck={false} maxLength={200} disabled={busy || attempted}
        className="mt-2 w-full rounded border border-slate-600 bg-slate-950 p-2 text-slate-100 disabled:opacity-50" />
      <label className="mt-4 flex items-start gap-3 text-sm">
        <input type="checkbox" checked={confirmed}
          onChange={event => setConfirmed(event.target.checked)}
          disabled={busy || attempted} className="mt-1" />
        I approve exactly one Preview-only audit email to the already authorized
        owner inbox. Provider acceptance does not prove inbox delivery.
      </label>
      <button type="button" onClick={() => void dispatchOnce()}
        disabled={busy || attempted || !confirmed || !REQUEST_ID.test(requestId.trim())}
        className="mt-4 rounded border border-cyan-500 px-4 py-3 font-semibold text-cyan-100 disabled:opacity-50">
        {busy ? "Submitting once..." : attempted ? "Attempt completed — check records" : "Submit ONE owner-only TEST email"}
      </button>
      {result && <p role="status" className="mt-3 text-sm text-amber-200">{result}</p>}
      <p className="mt-3 text-xs text-slate-400">
        One browser attempt only. Never retry a failed or ambiguous send before
        independently inspecting the durable outbox and recipient inbox.
      </p>
    </section>
  )
}
