"use client"

import { FormEvent, useState } from "react"
import { ArrowRight, Loader2 } from "lucide-react"

export function QuickAuditOwnerPilotForm() {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError("")
    const form = new FormData(event.currentTarget)
    try {
      const response = await fetch("/api/internal/quick-audit/owner-pilot/checkout", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: form.get("businessName"),
          websiteUrl: form.get("websiteUrl"),
          industry: form.get("industry"),
          goals: form.get("goals"),
          notes: form.get("notes"),
        }),
      })
      const body = await response.json().catch(() => null) as { ok?: boolean; url?: string; testMode?: boolean } | null
      if (!response.ok || !body?.ok || !body.testMode || !body.url?.startsWith("https://checkout.stripe.com/")) {
        throw new Error("PILOT_NOT_READY")
      }
      window.location.assign(body.url)
    } catch {
      setError("The private test checkout is not ready. No payment was initiated. Check the pilot gates before retrying.")
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-2xl border p-5 sm:p-7">
      <div><h2 className="text-xl font-bold">AMS self-audit intake</h2><p className="mt-1 text-sm text-muted-foreground">Edit the goals as needed. Only test data will be sent to Stripe&apos;s sandbox Checkout.</p></div>
      <label className="block space-y-1 text-sm font-medium">Business name
        <input className="w-full rounded-lg border bg-background px-3 py-3" name="businessName" maxLength={200} defaultValue="Aspect Marketing Solutions" required />
      </label>
      <label className="block space-y-1 text-sm font-medium">Public site URL
        <input className="w-full rounded-lg border bg-background px-3 py-3" name="websiteUrl" type="url" maxLength={500} defaultValue="https://www.aspectmarketingsolutions.app" required />
      </label>
      <label className="block space-y-1 text-sm font-medium">Industry
        <input className="w-full rounded-lg border bg-background px-3 py-3" name="industry" maxLength={120} defaultValue="Marketing SaaS and business services" required />
      </label>
      <label className="block space-y-1 text-sm font-medium">Primary marketing goal
        <textarea className="min-h-20 w-full rounded-lg border bg-background px-3 py-3" name="goals" maxLength={500} defaultValue="Improve trust and conversion from the AMS website to the Quick Marketing Audit" required />
      </label>
      <label className="block space-y-1 text-sm font-medium">Additional notes
        <textarea className="min-h-20 w-full rounded-lg border bg-background px-3 py-3" name="notes" maxLength={500} defaultValue="Internal acceptance pilot only; score public evidence honestly and distinguish measured performance from hypotheses." />
      </label>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      <button type="submit" disabled={submitting} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground disabled:opacity-50">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        {submitting ? "Opening Stripe test checkout" : "Open $5 Stripe test checkout — no real charge"}
      </button>
      <p className="text-xs text-muted-foreground">The configured one-use $44 test coupon keeps the original $49 line-item price intact for signed webhook fulfillment. Never enter real card details in this test checkout.</p>
    </form>
  )
}
