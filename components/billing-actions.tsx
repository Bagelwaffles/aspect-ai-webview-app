"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

type BillingActionProps = {
  label: string
  endpoint: "/api/billing/checkout" | "/api/billing/portal"
  organizationId?: string
  userId?: string
  variant?: "default" | "outline"
}

export function BillingActionButton({
  label,
  endpoint,
  organizationId = "cmrgmpcd50001iqyo57iirzo6",
  userId = "cmrgmpccu0000iqyo2p2stz99",
  variant = "default"
}: BillingActionProps) {
  const [busy, setBusy] = useState(false)

  async function onClick() {
    setBusy(true)
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId, userId })
      })

      const payload = await response.json().catch(() => null)
      const url = payload?.url
      if (response.ok && typeof url === "string") {
        window.location.href = url
        return
      }

      throw new Error(payload?.error || "Billing action failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button onClick={onClick} disabled={busy} variant={variant}>
      {label}
    </Button>
  )
}
