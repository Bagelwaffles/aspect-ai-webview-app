"use client"

import { useRef, useState } from "react"

/**
 * One deliberate owner-initiated POST to the existing PR #316 buyer-link endpoint.
 * This component never arms server switches, sends on mount, fetches credentials,
 * creates checkout sessions or retries a network-uncertain request.
 * Server-side owner auth, expiry, Stripe, Resend proof and NX/CAS remain authoritative.
 */
const REQUEST_ID = /^quick-audit-[A-Za-z0-9_-]{8,190}$/u
const RESULT_CODE = /^PILOT_BUYER_LINK_[A-Z_]{4,60}$/u
const ENDPOINT = "/api/internal/quick-audit-pilot-buyer-link-dispatch"

export function BuyerLinkDispatchControls() {
  const [requestId, setRequestId] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const submittedRef = useRef(false)

  async function sendOnce() {
    const exact = requestId.trim()
    if (submittedRef.current || busy || !confirmed || !REQUEST_ID.test(exact)) return

    // Set this synchronously BEFORE any await so repeated clicks cannot POST twice.
    // A refresh is never permission to retry: the durable server outbox guards that.
    submittedRef.current = true
    setAttempted(true)
    setBusy(true)
    setResult(null)

    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        redirect: "error",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: exact }),
      })
      const data: unknown = await response.json().catch(() => null)
      const body = data && typeof data === "object" && !Array.isArray(data)
        ? data as Record<string, unknown> : null
      const code = typeof body?.code === "string" && RESULT_CODE.test(body.code)
        ? body.code : "PILOT_BUYER_LINK_RESPONSE_UNCONFIRMED"

      if (response.status === 200 && body?.ok === true && code === "PILOT_BUYER_LINK_SUBMITTED") {
        setResult("Resend accepted one buyer-link TEST submission (HTTP 200). Inbox delivery and signed report access are NOT yet proven. Verify the owner inbox and durable buyer-link outbox.")
      } else {
        setResult(`HTTP ${response.status} — ${code}. Do not retry; independently check the buyer-link outbox and owner inbox before another decision.`)
      }
    } catch {
      setResult("Buyer-link dispatch outcome UNKNOWN. Do not retry, reload to retry, or arm another window until the owner inbox and durable outbox are independently inspected.")
    } finally {
      setBusy(false)
    }
  }

  const canSubmit = !busy && !attempted && confirmed && REQUEST_ID.test(requestId.trim())

  return (
    <section className="rounded-2xl border border-violet-500/60 bg-slate-900/75 p-6" aria-labelledby="buyer-link-test-title">
      <p className="text-xs font-semibold uppercase tracking-widest text-violet-300">PR #316 / buyer report link / Preview only</p>
      <h2 id="buyer-link-test-title" className="mt-2 text-lg font-semibold">Manual owner-only buyer-link TEST delivery</h2>
      <p className="mt-2 text-sm text-slate-300">
        This is NOT the earlier audit-email dispatch. It invokes the separate buyer-link
        endpoint for an existing $49 TEST audit only. No request runs on page load.
        A fresh verified Resend domain proof and an independently authorized,
        expiring 10-minute Preview send window are required by the server.
      </p>
      <label htmlFor="buyer-link-existing-request-id" className="mt-4 block text-sm">
        Existing paid TEST Quick Audit request ID
      </label>
      <input id="buyer-link-existing-request-id" type="text"
        value={requestId} onChange={event => setRequestId(event.target.value)}
        placeholder="quick-audit-..." autoComplete="off" autoCapitalize="none"
        spellCheck={false} maxLength={200} disabled={busy || attempted}
        className="mt-2 w-full rounded border border-slate-600 bg-slate-950 p-2 text-slate-100 disabled:opacity-50" />
      <label className="mt-4 flex items-start gap-3 text-sm">
        <input type="checkbox" checked={confirmed}
          onChange={event => setConfirmed(event.target.checked)}
          disabled={busy || attempted} className="mt-1" />
        I authorize at most ONE Preview-only buyer-report link email to the
        already verified AMS owner TEST recipient for this existing paid order.
        No Stripe checkout, automatic retry or customer email is authorized.
      </label>
      <button type="button" onClick={() => void sendOnce()} disabled={!canSubmit}
        className="mt-4 rounded border border-violet-400 px-4 py-3 font-semibold text-violet-100 disabled:opacity-50">
        {busy ? "Submitting once..." : attempted ? "Attempt recorded — inspect evidence" : "Submit ONE buyer-link TEST email"}
      </button>
      {result && <p role="status" className="mt-3 text-sm text-amber-200">{result}</p>}
      <p className="mt-3 text-xs text-slate-400">
        A blocked, failed, or uncertain response is not permission to retry.
        Inspect the distinct buyer-link Redis outbox and recipient inbox first.
        This control cannot enable sending, change Production, or create a payment.
      </p>
    </section>
  )
}
