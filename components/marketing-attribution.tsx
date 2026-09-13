"use client"

import { useEffect } from "react"

const TRACKED_UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content"] as const

export function MarketingAttribution() {
  useEffect(() => {
    const url = new URL(window.location.href)
    const payload = Object.fromEntries(
      TRACKED_UTM_KEYS.map((key) => [key, url.searchParams.get(key) ?? ""]),
    )

    if (!payload.utm_source && !payload.utm_campaign) return

    const fingerprint = `${url.pathname}?${TRACKED_UTM_KEYS.map((key) => `${key}=${payload[key]}`).join("&")}`
    const sessionKey = "ams_marketing_attribution"

    if (window.sessionStorage.getItem(sessionKey) === fingerprint) return
    window.sessionStorage.setItem(sessionKey, fingerprint)

    void fetch("/api/marketing/attribution", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...payload,
        path: url.pathname,
      }),
      keepalive: true,
    }).catch(() => {
      // Attribution is non-critical and must never interfere with the buyer journey.
    })
  }, [])

  return null
}
