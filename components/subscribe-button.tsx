"use client"

import { useState } from "react"

export default function SubscribeButton({
  label = "Start Subscription",
  className = "",
  customer_email,
}: { label?: string; className?: string; customer_email?: string }) {
  const [loading, setLoading] = useState(false)
  return (
    <button
      onClick={async () => {
        setLoading(true)
        try {
          const res = await fetch("/api/stripe/create-checkout-session", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ customer_email }),
          })
          const j = await res.json()
          if (!res.ok) throw new Error(j?.error || res.statusText)
          window.location.href = j.url
        } catch (e) {
          alert((e as any)?.message || "Checkout failed")
        } finally {
          setLoading(false)
        }
      }}
      disabled={loading}
      className={["rounded-lg bg-white/10 hover:bg-white/20 px-4 py-2", className].join(" ")}
    >
      {loading ? "Redirecting…" : label}
    </button>
  )
}
