"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"

type BillingActionProps = {
  label: string
  endpoint: "/api/billing/checkout" | "/api/billing/portal"
  plan?: "starter" | "growth" | "pro"
  variant?: "default" | "outline"
}

export function BillingActionButton({
  label,
  endpoint,
  plan,
  variant = "default",
}: BillingActionProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onClick() {
    setBusy(true)
    setError(null)

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(plan ? { plan } : {}),
      })

      const payload = await response.json().catch(() => null)
      const url = payload?.url
      if (response.ok && typeof url === "string") {
        window.location.assign(url)
        return
      }

      setError(typeof payload?.error === "string" ? payload.error : "Billing action failed")
    } catch {
      setError("Billing service is unavailable")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" onClick={onClick} disabled={busy} variant={variant}>
        {busy ? "Opening…" : label}
      </Button>
      {error && <p className="max-w-56 text-xs text-destructive">{error}</p>}
    </div>
  )
}
