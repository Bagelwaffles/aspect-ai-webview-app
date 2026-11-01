"use client"

import { useRef, useState } from "react"

/** Uncontrolled ephemeral password input: no storage, query string, analytics, or key state. */
export function DomainVerificationControls() {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [used, setUsed] = useState(false)

  async function checkBrowserAuthorization() {
    if (busy || used) return
    setBusy(true)
    setResult(null)
    try {
      const response = await fetch("/api/internal/quick-audit-resend-domain-verify", {
        method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
        referrerPolicy: "no-referrer", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkOnly: true }),
      })
      const data: unknown = await response.json().catch(() => null)
      const code = data && typeof data === "object" && "code" in data &&
        typeof data.code === "string" && /^OWNER_DOMAIN_VERIFY_[A-Z_]{4,80}$/.test(data.code)
        ? data.code : "OWNER_DOMAIN_VERIFY_RESPONSE_UNCONFIRMED"
      const ready = response.status === 200 && code === "OWNER_DOMAIN_VERIFY_PREFLIGHT_READY"
      setResult(`HTTP ${response.status} — ${code}. ${ready
        ? "Browser authorization and the expiring verification window pass. No key was used, no attempt consumed, and no domain proof was created."
        : "Browser or verification-window check failed. Do not create or submit a temporary Resend key yet."}`)
    } catch {
      setResult("Browser diagnostic unavailable. No key was used or attempt consumed.")
    } finally { setBusy(false) }
  }

  async function verify() {
    if (busy || used || !input.current) return
    let fullAccessKey = input.current.value
    input.current.value = ""
    setBusy(true)
    setUsed(true)
    setResult(null)
    try {
      const response = await fetch("/api/internal/quick-audit-resend-domain-verify", {
        method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
        referrerPolicy: "no-referrer", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullAccessKey }),
      })
      fullAccessKey = ""
      const data: unknown = await response.json().catch(() => null)
      const code = data && typeof data === "object" && "code" in data &&
        typeof data.code === "string" && /^OWNER_DOMAIN_VERIFY_[A-Z_]{4,80}$/.test(data.code)
        ? data.code : "OWNER_DOMAIN_VERIFY_RESPONSE_UNCONFIRMED"
      const passed = response.status === 200 && code === "OWNER_DOMAIN_VERIFY_PROOF_WRITTEN_AND_READ"
      setResult(`HTTP ${response.status} — ${code}. ${passed
        ? "Domain API verification PASS; 900-second proof written and read. Revoke the temporary key now."
        : "Verification blocked. Revoke the temporary key now; no successful proof is claimed. Report this safe error code, never the credential."}`)
    } catch {
      setResult("Request unavailable. Revoke the temporary key now; no successful proof is claimed.")
    } finally { fullAccessKey = ""; setBusy(false) }
  }

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/75 p-6">
      <h2 className="text-lg font-semibold">Temporary owner domain verification</h2>
      <p className="mt-2 text-sm text-slate-300">One read-only Resend domain check in the approved 15-minute window. The temporary key is cleared on submission and never saved. Revoke it in Resend immediately afterward. All sending and payment switches stay off.</p>
      <button type="button" disabled={busy || used} onClick={() => void checkBrowserAuthorization()}
        className="mt-4 rounded border border-sky-400 px-4 py-2 text-sm disabled:opacity-50">
        {busy ? "Checking..." : "Test browser authorization — no key needed"}
      </button>
      <p className="mt-2 text-xs text-slate-400">Run this first. It checks the owner session, browser origin and current Preview window without contacting Resend, consuming the one-attempt guard, or creating proof.</p>
      <label htmlFor="temporary-domain-key" className="mt-4 block text-sm">Temporary Resend Full Access key</label>
      <input ref={input} id="temporary-domain-key" type="password" autoComplete="off"
        spellCheck={false} autoCapitalize="none" data-gramm="false" data-gramm_editor="false"
        data-enable-grammarly="false" data-lpignore="true" data-1p-ignore="true"
        disabled={busy || used} className="mt-2 w-full rounded border border-slate-600 bg-slate-950 p-2" />
      <button type="button" disabled={busy || used} onClick={() => void verify()}
        className="mt-4 rounded border border-cyan-500 px-4 py-2 text-sm disabled:opacity-50">
        {busy ? "Verifying..." : "Verify domain and save temporary proof"}
      </button>
      {result && <p role="status" className="mt-3 text-sm">{result}</p>}
    </section>
  )
}
