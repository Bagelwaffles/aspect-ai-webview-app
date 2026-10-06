"use client"
import { useEffect, useState } from "react"
type Account = { slot: "primary" | "secondary"; status: string; testing?: boolean; grantExpiresAt?: string | null }
export default function GmailConnections() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => { void fetch("/api/owner/gmail", { cache: "no-store" }).then(async response => { if (!response.ok) throw new Error("Gmail status unavailable"); const data = await response.json(); setAccounts(data.accounts) }).catch(() => setError("Gmail status unavailable")) }, [])
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
      setError(data.ok ? "Test message confirmed in the primary inbox." : "Delivery is unconfirmed. Review the connection and sender configuration before retrying.")
    } catch { setError("Test delivery is unconfirmed.") } finally { setBusy(false) }
  }
  return <section className="my-6 rounded border p-4"><h2 className="text-lg font-semibold">Owner Gmail connections</h2><p className="my-2 text-sm">Authorize each account separately. Monitoring reads relevant metadata and never modifies your mailbox. Only the primary account can send owner alerts.</p>{error && <p role="alert">{error}</p>}<div className="grid gap-3 sm:grid-cols-2">{accounts.map(account => <div key={account.slot} className="rounded border p-3"><h3 className="capitalize font-medium">{account.slot} account</h3><p>{account.status}</p>{account.testing && <p>Testing authorization expires after seven days. Reauthorization is required by {account.grantExpiresAt ? new Date(account.grantExpiresAt).toLocaleString() : "the grant expiry"}.</p>}<button className="mt-2 rounded border px-3 py-2" disabled={busy} onClick={() => void connect(account.slot)}>Authorize {account.slot}</button></div>)}</div><button className="mt-3 rounded border px-3 py-2" disabled={busy} onClick={() => void testDelivery()}>Send owner test alert</button></section>
}
