"use client"
import { useState } from "react"

export default function SubscribeButton() {
  const [loading, setLoading] = useState(false)

  return (
    <button
      onClick={async () => {
        setLoading(true)
        try {
          const r = await fetch("/api/stripe/create-checkout-session", { method: "POST" })
          const { url } = await r.json()
          window.location.href = url
        } catch (error) {
          console.error("Checkout error:", error)
          setLoading(false)
        }
      }}
      disabled={loading}
      className="rounded-xl px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-50"
    >
      {loading ? "Redirecting..." : "Start Subscription"}
    </button>
  )
}
