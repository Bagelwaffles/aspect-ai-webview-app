"use client"

import { signIn, signOut } from "next-auth/react"

import { Button } from "@/components/ui/button"
const YOUTUBE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload"
const YOUTUBE_READONLY_SCOPE = "https://www.googleapis.com/auth/youtube.readonly"

export default function YouTubeOwnerConnectButton({
  mode = "connect",
}: {
  mode?: "connect" | "signout"
}) {
  if (mode === "signout") {
    return (
      <Button
        variant="outline"
        onClick={() => void signOut({ callbackUrl: "/owner/youtube-connect" })}
      >
        Sign out and use owner account
      </Button>
    )
  }

  return (
    <Button
      onClick={() =>
        void signIn(
          "google",
          { callbackUrl: "/owner/youtube-connect" },
          {
            scope: [
              "openid",
              "email",
              "profile",
              YOUTUBE_UPLOAD_SCOPE,
              YOUTUBE_READONLY_SCOPE,
            ].join(" "),
            access_type: "offline",
            prompt: "consent",
            include_granted_scopes: "true",
          },
        )
      }
    >
      Connect SmokyBanana03 YouTube
    </Button>
  )
}
