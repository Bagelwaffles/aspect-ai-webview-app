"use client"
import { useEffect, useState } from "react"
import { gmailConnectionFeedback, gmailTestDeliveryFeedback } from "@/lib/gmail-connection-feedback"
import type { RefreshVerification } from "@/lib/server/owner-gmail-refresh-verification"
type Account = { slot: "primary" | "secondary"; status: string; testing?: boolean; grantExpiresAt?: string | null }
type AutoReply = { armed: boolean; mode: string; liveSendingVerified: boolean }
export default function GmailConnections() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [autoReply, setAutoReply] = useState<AutoReply | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [refreshVerificationAvailable, setRefreshVerificationAvailable] = useState(false)
  const [refreshEvidence, setRefreshEvidence] = useState<Partial<Record<Account["slot"], RefreshVerification>>>({})
  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("gmail")
    if (status && Object.hasOwn(gmailConnectionFeedback, status)) setError(gmailConnectionFeedback[status as keyof typeof gmailConnectionFeedback])
  }, [])
  useEffect(() => { void fetch("/api/owner/gmail", { cache: "no-store" }).then(async response => { if (!response.ok) throw new Error("Gmail status unavailable"); const data = await response.json(); setAccounts(data.accounts); setAutoReply(data.autoReply ?? null); setRefreshVerificationAvailable(data.refreshVerificationAvailable === true) }).catch(() => setError("Gmail status unavailable")) }, [])
  async function verifyRefresh(slot: Account["slot"]) {
    setBusy(true); setError("")
    try {
      const response = await fetch("/api/owner/gmail/verify-refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slot, requestId: crypto.randomUUID() }) })
      const data = await response.json()
      if (!response.ok || !data.evidence) throw new Error("Refresh verification unavailable. Keep this account paused and review its connection.")
      setRefreshEvidence(previous => ({ ...previous, [slot]: data.evidence }))
      setError(data.evidence.status === "passed" ? `${slot} refresh, persistence, read and deduplication verified.` : data.evidence.status === "awaiting-expiry" ? `${slot} access token is still valid. Try verification after natural expiry; no forced refresh was performed.` : `${slot} refresh acceptance is ${data.evidence.status}. Review the evidence; keep the PR on hold.`)
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Refresh verification unavailable.") } finally { setBusy(false) }
  }
  async function connect(slot: Account["slot"]) {
    setBusy(true); setError("")
    try {
      const response = await fetch(`/api/owner/gmail/${slot}/connect`, { method: "POST" })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error("Connection configuration is required before authorization.")
      const url = new URL(data.url)
      if (url.origin !== "https://accounts.google.com") throw new Error("Invalid authorization destination")
      window.location.assign(url.toString())
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Connection unavailable"); setBusy(false) }
  }
  async function testDelivery() {
    setBusy(true); setError("")
    try {
      const response = await fetch("/api/owner/gmail/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: crypto.randomUUID() }) })
      const data = await response.json()
      setError(response.ok && data.ok ? "Test message confirmed in the primary inbox." : gmailTestDeliveryFeedback(data.code))
    } catch { setError("Test delivery is unconfirmed.") } finally { setBusy(false) }
  }
  return <section className="my-6 rounded border p-4"><h2 className="text-lg font-semibold">Owner Gmail connections</h2><p className="my-2 text-sm">Authorize each account separately. Monitoring reads relevant metadata and never modifies your mailbox. Only the primary account can send owner alerts and, when separately enabled, first-contact acknowledgements to clearly identified AMS inquiries. No automatic refunds, marketing campaigns, account changes or sensitive replies.</p>{autoReply && <p className="my-2 text-sm" role="status">Automatic AMS inquiry replies: {autoReply.armed ? "Configured for first-contact acknowledgements; live delivery still requires verification." : "Off until Gmail sender authorization and owner-controlled activation."}</p>}{error && <p role="alert">{error}</p>}<div className="grid gap-3 sm:grid-cols-2">{accounts.map(account => <div key={account.slot} className="rounded border p-3"><h3 className="capitalize font-medium">{account.slot} account</h3><p>{account.status}</p>{account.testing && <p>Testing authorization expires after seven days. Reauthorization is required by {account.grantExpiresAt ? new Date(account.grantExpiresAt).toLocaleString() : "the grant expiry"}.</p>}<button className="mt-2 rounded border px-3 py-2" disabled={busy} onClick={() => void connect(account.slot)}>Authorize {account.slot}</button>{refreshVerificationAvailable && <><button className="mt-2 rounded border px-3 py-2" disabled={busy || account.status !== "connected"} onClick={() => void verifyRefresh(account.slot)}>Verify {account.slot} refresh</button><p className="mt-2 text-sm">Preview acceptance only. Waits for natural access-token expiry; leaves task states and checkpoints unchanged and sends no notifications or replies.</p>{refreshEvidence[account.slot] && <pre className="mt-2 overflow-auto text-xs">{JSON.stringify(refreshEvidence[account.slot], null, 2)}</pre>}</>}</div>)}</div><button className="mt-3 rounded border px-3 py-2" disabled={busy} onClick={() => void testDelivery()}>Send owner test alert</button></section>
}
