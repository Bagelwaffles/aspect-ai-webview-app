"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"

import { Button } from "@/components/ui/button"

export function CustomerLoginButton({ callbackUrl }: { callbackUrl: string }) {
  const [loading, setLoading] = useState(false)

  return (
    <Button
      type="button"
      disabled={loading}
      onClick={async () => {
        setLoading(true)
        await signIn("google", { callbackUrl })
        setLoading(false)
      }}
    >
      {loading ? "Connecting…" : "Continue with Google"}
    </Button>
  )
}
