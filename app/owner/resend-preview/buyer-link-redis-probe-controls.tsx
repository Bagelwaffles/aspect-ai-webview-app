"use client"

import { useState } from "react"

/** One owner-triggered Preview Redis permission probe; never arms or sends. */
export function BuyerLinkRedisProbeControls() {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")
  async function check() {
    if (busy) return
    setBusy(true)
    setStatus("")
    try {
      const response = await fetch("/api/internal/quick-audit-buyer-link-redis-probe", {
        method: "POST", credentials: "same-origin", redirect: "error",
        cache: "no-store", referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json" }, body: "{}",
      })
      const body: unknown = await response.json().catch(() => null)
      const json = body && typeof body === "object" && !Array.isArray(body)
        ? body as Record<string, unknown> : null
      const code = typeof json?.code === "string" &&
        /^BUYER_LINK_REDIS_[A-Z_]+$/.test(json.code)
        ? json.code : "BUYER_LINK_REDIS_RESPONSE_UNCONFIRMED"
      setStatus("HTTP " + response.status + " — " + code)
    } catch {
      setStatus("No result — no email or payment was attempted.")
    } finally { setBusy(false) }
  }
  return (
    <section className="rounded-xl border border-cyan-700 p-5" aria-label="Buyer-link Redis permission diagnostic">
      <h2 className="font-semibold">Buyer-link Redis write-permission diagnostic</h2>
      <p className="mt-2 text-sm text-slate-300">
        Check a single disposable key in the isolated TEST database; automatically
        remove it. No customer record, email, checkout, key, or dispatch flag changes.
        A failed cleanup key expires in 45 seconds.
      </p>
      <button type="button" disabled={busy} onClick={() => void check()}
        className="mt-3 rounded-lg border border-cyan-500 px-4 py-2 disabled:opacity-50">
        {busy ? "Checking Preview Redis..." : "Test isolated Redis WRITE (no email)"}
      </button>
      {status && <p role="status" className="mt-3 text-sm text-amber-200">{status}</p>}
    </section>
  )
}
