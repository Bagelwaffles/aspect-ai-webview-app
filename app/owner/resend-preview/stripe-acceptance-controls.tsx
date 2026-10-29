"use client"

import { useState } from "react"

type Result = {
  ok?: boolean
  code?: string
  url?: string
  sessionId?: string
  emailSent?: boolean
  paymentPerformed?: boolean
}

const EVENT_PATTERN = /^evt_[A-Za-z0-9]{8,200}$/u

/** No auto-initiation. Existing guarded server endpoints enforce Preview-only,
 * owner session, exact sandbox ID, metadata, and ten-minute authorization.
 * This component cannot change environment switches or bypass Vercel.
 */
export function StripeAcceptanceControls() {
  const [busy, setBusy] = useState<"checkout" | "handoff" | null>(null)
  const [checkout, setCheckout] = useState<{ url: string; sessionId: string } | null>(null)
  const [checkoutResult, setCheckoutResult] = useState<string | null>(null)
  const [eventId, setEventId] = useState("")
  const [handoffResult, setHandoffResult] = useState<string | null>(null)

  async function request(route: string, payload: Record<string, string>): Promise<Result> {
    const response = await fetch(route, {
      method: "POST", credentials: "same-origin", redirect: "error", cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
    const raw: unknown = await response.json().catch(() => null)
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw Error("INVALID_OWNER_API_RESPONSE")
    }
    const data = raw as Result
    return { ...data, ok: response.ok && data.ok === true }
  }

  async function createTestCheckout() {
    if (busy) return
    setBusy("checkout")
    setCheckout(null)
    setCheckoutResult(null)
    try {
      const data = await request("/api/internal/quick-audit-owner-pilot-checkout", {
        confirm: "CREATE_ONE_STRIPE_TEST_CHECKOUT",
      })
      if (data.ok && data.code === "PILOT_TEST_CHECKOUT_CREATED" &&
          /^cs_test_[A-Za-z0-9]{8,200}$/u.test(data.sessionId ?? "") &&
          typeof data.url === "string" &&
          /^https:\/\/checkout\.stripe\.com\//u.test(data.url)) {
        setCheckout({ sessionId: data.sessionId!, url: data.url })
        setCheckoutResult("TEST Checkout created (not paid). Use only Stripe TEST card details.")
      } else {
        setCheckoutResult(data.code || "TEST_CHECKOUT_NOT_AVAILABLE")
      }
    } catch {
      setCheckoutResult("Owner checkout request unavailable; do not retry payment.")
    } finally {
      setBusy(null)
    }
  }

  async function confirmPaidAudit() {
    const exact = eventId.trim()
    if (busy || !EVENT_PATTERN.test(exact)) return
    setBusy("handoff")
    setHandoffResult(null)
    try {
      const data = await request("/api/internal/quick-audit-owner-signed-handoff", { eventId: exact })
      setHandoffResult(data.code || "SIGNED_RECEIPT_HANDOFF_NOT_CONFIRMED")
    } catch {
      setHandoffResult("Handoff unavailable. Do not generate a second audit or Checkout.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="rounded-2xl border border-amber-500/50 bg-slate-900/75 p-6 shadow-lg">
      <h2 className="text-lg font-semibold">One controlled Stripe TEST audit</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-300">
        Owner-only acceptance controls. No action runs when this page loads. The server
        refuses requests unless a separately approved, short TEST-only window is armed.
        Production and email sending stay OFF. Never use a real card.
      </p>
      <div className="mt-5 space-y-3">
        <h3 className="font-semibold">1. Create the single TEST Checkout</h3>
        <p className="text-xs text-slate-400">
          Creates one sandbox session only, not a charge. Leave this closed until
          the approved TEST window and Stripe webhook are confirmed ready.
        </p>
        <button type="button" disabled={busy !== null} onClick={() => void createTestCheckout()}
          className="rounded-lg border border-amber-400/60 px-4 py-3 text-sm font-semibold text-amber-100 disabled:opacity-50">
          {busy === "checkout" ? "Checking TEST authorization..." : "Create owner-only TEST Checkout"}
        </button>
        {checkoutResult && <p role="status" className="text-sm text-amber-200">{checkoutResult}</p>}
        {checkout && (
          <div className="rounded-lg border border-emerald-700 p-3 text-sm">
            <p>Sandbox session prepared; no payment has been performed.</p>
            <a className="mt-2 inline-block font-semibold text-emerald-300 underline"
              href={checkout.url} target="_blank" rel="noopener noreferrer">
              Open Stripe TEST Checkout
            </a>
          </div>
        )}
      </div>
      <div className="mt-6 space-y-3 border-t border-slate-700 pt-5">
        <h3 className="font-semibold">2. Confirm the genuine Stripe event</h3>
        <p className="text-xs text-slate-400">
          Only after the TEST Checkout is paid, Stripe has sent its signed
          event, and the owner has the exact event ID. This action never sends email.
        </p>
        <label htmlFor="owner-test-event-id" className="block text-sm">Stripe TEST event ID</label>
        <input id="owner-test-event-id" value={eventId} onChange={e => setEventId(e.target.value)}
          placeholder="evt_..." spellCheck={false} autoCapitalize="none" autoComplete="off"
          className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 text-sm text-slate-100"
        />
        <button type="button" disabled={busy !== null || !EVENT_PATTERN.test(eventId.trim())}
          onClick={() => void confirmPaidAudit()}
          className="rounded-lg border border-cyan-500/60 px-4 py-3 text-sm font-semibold text-cyan-100 disabled:opacity-50">
          {busy === "handoff" ? "Verifying durable audit..." : "Verify paid TEST audit and owner outbox"}
        </button>
        {handoffResult && <p role="status" className="text-sm text-cyan-200">{handoffResult}</p>}
      </div>
    </section>
  )
}
