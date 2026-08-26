"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CREDIT_TOPUP_PACKS, isAndroidWebViewUserAgent, type CreditTopupPackSlug } from "@/lib/credit-topups"

function newRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`
}

export function CreditTopupPurchasePanel() {
  const [surfaceChecked, setSurfaceChecked] = useState(false)
  const [blockedInPlayWebView, setBlockedInPlayWebView] = useState(false)
  const [busyPack, setBusyPack] = useState<CreditTopupPackSlug | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setBlockedInPlayWebView(isAndroidWebViewUserAgent(window.navigator.userAgent))
    setSurfaceChecked(true)
  }, [])

  async function buy(pack: CreditTopupPackSlug) {
    setBusyPack(pack)
    setError(null)

    try {
      const response = await fetch("/api/billing/topup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pack, requestId: newRequestId() }),
      })

      if (response.status === 401) {
        const next = encodeURIComponent(window.location.pathname)
        window.location.assign(`/login?next=${next}`)
        return
      }

      const payload = await response.json().catch(() => null)
      const url = payload?.url
      if (response.ok && typeof url === "string") {
        window.location.assign(url)
        return
      }

      setError(typeof payload?.error === "string" ? payload.error : "Credit purchase failed")
    } catch {
      setError("Credit purchase service is unavailable")
    } finally {
      setBusyPack(null)
    }
  }

  if (!surfaceChecked) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Extra credits</CardTitle>
          <CardDescription>Checking purchase availability for this device.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (blockedInPlayWebView) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Extra credits</CardTitle>
          <CardDescription>
            Credit purchases are not offered on this Android app billing surface.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Need more credits?</h2>
        <p className="text-sm text-muted-foreground">
          Top-up credits do not expire. AMS uses monthly plan credits first, then your purchased top-up balance.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {CREDIT_TOPUP_PACKS.map((pack) => (
          <Card key={pack.slug}>
            <CardHeader>
              <CardTitle>{pack.name}</CardTitle>
              <CardDescription>{pack.priceLabel} one-time</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Adds {pack.units.toLocaleString()} non-expiring shared generation credits to this AMS account after Stripe confirms payment.
              </p>
              <Button
                type="button"
                onClick={() => buy(pack.slug)}
                disabled={busyPack !== null}
                className="w-full"
              >
                {busyPack === pack.slug ? "Opening Stripe…" : `Buy ${pack.name} — ${pack.priceLabel}`}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <p className="text-xs text-muted-foreground">
        Manual top-ups only. AMS does not automatically charge for extra credits.
      </p>
    </section>
  )
}
