"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

type EthicalOfferCheckoutButtonProps = {
  label: string
  offerSlug: string
  fallbackHref: string
  organizationId?: string
  userId?: string
  variant?: "default" | "outline"
}

export function EthicalOfferCheckoutButton({
  label,
  offerSlug,
  fallbackHref,
  organizationId = "cmrgmpcd50001iqyo57iirzo6",
  userId = "cmrgmpccu0000iqyo2p2stz99",
  variant = "default",
}: EthicalOfferCheckoutButtonProps) {
  const [busy, setBusy] = useState(false)

  async function onClick() {
    setBusy(true)
    try {
      const response = await fetch("/api/ethical-agent-farm/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          offer: offerSlug,
          organizationId,
          userId,
        }),
      })

      const payload = await response.json().catch(() => null)
      const url = payload?.url

      if (response.ok && typeof url === "string") {
        window.location.href = url
        return
      }

      const fallbackPath = typeof payload?.fallbackPath === "string" ? payload.fallbackPath : fallbackHref
      window.location.href = fallbackPath
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
