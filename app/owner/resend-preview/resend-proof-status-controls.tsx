"use client"

import { useState } from "react"

export function ResendProofStatusControls() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  async function inspect() {
    if (busy) return
    setBusy(true); setResult(null)
    try {
      const response = await fetch("/api/internal/quick-audit-resend-proof-status", {
        method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error",
        referrerPolicy: "no-referrer",
      })
      const raw: unknown = await response.json().catch(() => null)
      const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
      if (response.ok && body.status === "current" && typeof body.remainingSeconds === "number" && typeof body.verifiedAt === "string") {
        setResult("PASS — verified " + body.verifiedAt + "; " + body.remainingSeconds + " seconds remaining.")
      } else if (response.ok && (body.status === "expired" || body.status === "missing" || body.status === "invalid")) {
        setResult(String(body.status).toUpperCase() + " — no sending or renewal was attempted.")
      } else {
        setResult("HTTP " + response.status + " — " + (typeof body.code === "string" ? body.code : "STATUS_UNCONFIRMED"))
      }
    } catch { setResult("Status read unavailable. No proof or sending settings were changed.") }
    finally { setBusy(false) }
  }
  return (
    <section className="rounded-xl border border-cyan-700 p-5">
      <h2 className="font-semibold">Resend domain proof freshness</h2>
      <p className="mt-2 text-sm text-slate-300">Read-only check of the existing Preview proof timestamp and remaining TTL. No renewal, provider request, or email.</p>
      <button type="button" disabled={busy} onClick={() => void inspect()} className="mt-3 rounded-lg border border-cyan-500 px-4 py-2 disabled:opacity-50">
        {busy ? "Reading proof status..." : "Check proof timestamp and TTL"}
      </button>
      {result && <p role="status" className="mt-3 text-sm text-amber-200">{result}</p>}
    </section>
  )
}
