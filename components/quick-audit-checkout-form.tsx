"use client"

import { FormEvent, useState } from "react"
import { ArrowRight, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type CheckoutResponse = {
  ok?: boolean
  url?: string
}

export function QuickAuditCheckoutForm() {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError("")
    const form = new FormData(event.currentTarget)
    try {
      const response = await fetch("/api/quick-marketing-audit/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessName: form.get("businessName"),
          websiteUrl: form.get("websiteUrl"),
          industry: form.get("industry"),
          goals: form.get("goals"),
          notes: form.get("notes"),
        }),
      })
      const body = await response.json().catch(() => null) as CheckoutResponse | null
      if (!response.ok || !body?.ok || !body.url) throw new Error("CHECKOUT_UNAVAILABLE")
      window.location.assign(body.url)
    } catch {
      setError("Secure checkout is temporarily unavailable. Please try again shortly.")
      setSubmitting(false)
    }
  }

  return (
    <form className="space-y-4" id="quick-audit-checkout" onSubmit={submit} autoComplete="on">
      <div className="space-y-2">
        <Label htmlFor="quick-audit-business">Business name</Label>
        <Input
          id="quick-audit-business"
          className="h-11 text-base"
          maxLength={200}
          name="businessName"
          autoComplete="organization"
          inputMode="text"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="quick-audit-website">Website URL</Label>
        <Input
          id="quick-audit-website"
          className="h-11 text-base"
          maxLength={500}
          name="websiteUrl"
          placeholder="https://example.com"
          autoCapitalize="none"
          autoComplete="url"
          inputMode="url"
          spellCheck={false}
          required
          type="url"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="quick-audit-industry">Industry</Label>
        <Input
          id="quick-audit-industry"
          className="h-11 text-base"
          maxLength={120}
          name="industry"
          inputMode="text"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="quick-audit-goals">Main marketing goal</Label>
        <Textarea
          id="quick-audit-goals"
          className="min-h-24 text-base"
          maxLength={500}
          name="goals"
          autoCapitalize="sentences"
          spellCheck
          required
          rows={3}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="quick-audit-notes">Anything else we should know?</Label>
        <Textarea
          id="quick-audit-notes"
          className="min-h-24 text-base"
          maxLength={500}
          name="notes"
          autoCapitalize="sentences"
          spellCheck
          rows={3}
        />
      </div>
      {error ? <p aria-live="polite" className="text-sm text-destructive">{error}</p> : null}
      <Button className="h-11 w-full" disabled={submitting} size="lg" type="submit">
        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
        {submitting ? "Opening secure checkout" : "Continue to Stripe - $49"}
      </Button>
    </form>
  )
}
