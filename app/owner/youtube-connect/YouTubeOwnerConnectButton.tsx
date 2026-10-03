"use client"

import { useState } from "react"
import { signIn, signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"
const YOUTUBE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload"
const YOUTUBE_READONLY_SCOPE = "https://www.googleapis.com/auth/youtube.readonly"
const YOUTUBE_FORCE_SSL_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl"

export default function YouTubeOwnerConnectButton({
  mode = "connect",
}: {
  mode?: "connect" | "signout" | "signin"
}) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  if (mode === "signout") {
    return <Button variant="outline" onClick={() => void signOut({ callbackUrl: "/owner/youtube-connect" })}>
      Sign out and use owner account
    </Button>
  }
  if (mode === "signin") {
    return <Button onClick={() => void signIn("google", { callbackUrl: "/owner/youtube-connect" },
      { scope: "openid email profile", prompt: "select_account" })}>
      Sign in with AMS owner account
    </Button>
  }
  async function connect() {
    setBusy(true)
    setFailed(false)
    try {
      const response = await fetch("/api/internal/youtube/owner-attempt", {
        method: "POST", credentials: "same-origin",
      })
      const result = await response.json()
      if (!response.ok || result.ok !== true) throw new Error("connection_failed")
      await signIn("google", { callbackUrl: "/owner/youtube-connect" }, {
        scope: ["openid", "email", "profile", YOUTUBE_UPLOAD_SCOPE, YOUTUBE_READONLY_SCOPE, YOUTUBE_FORCE_SSL_SCOPE].join(" "),
        access_type: "offline", prompt: "consent select_account", include_granted_scopes: "true",
      })
    } catch { setFailed(true); setBusy(false) }
  }
  return <div className="space-y-3">
    <Button disabled={busy} onClick={() => void connect()}>
      {busy ? "Opening Google authorization…" : "Connect SmokyBanana03 YouTube"}
    </Button>
    {failed ? <p className="text-sm text-amber-600">Connection could not start. Confirm owner sign-in and retry.</p> : null}
  </div>
}
