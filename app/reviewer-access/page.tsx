"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

const REVIEWER_EMAIL = "play-reviewer@aspectmarketingsolutions.app"

export default function ReviewerAccessPage() {
  const searchParams = useSearchParams()
  const nextPath = useMemo(() => {
    const candidate = searchParams.get("next")?.trim()
    if (!candidate || !candidate.startsWith("/")) {
      return "/billing"
    }

    return candidate
  }, [searchParams])

  const [email, setEmail] = useState(REVIEWER_EMAIL)
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function submit() {
    setBusy(true)
    setError("")

    try {
      const response = await fetch("/api/reviewer-access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code })
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setError(payload?.error || "Unable to open reviewer access.")
        return
      }

      window.location.href = nextPath
    } catch {
      setError("Unable to open reviewer access.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 sm:max-w-2xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold leading-tight sm:text-3xl">Reviewer Access</h1>
            <p className="max-w-prose text-sm text-muted-foreground sm:text-base">
              Safe demo access for Google Play review. No admin controls, secrets, or live charge completion.
            </p>
          </div>
          <Button asChild variant="outline" className="w-full shrink-0 sm:w-auto">
            <Link href="/">Back to dashboard</Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl sm:text-2xl">Open the review demo</CardTitle>
            <CardDescription className="text-sm sm:text-base">
              Enter the reviewer email and access code provided in Play Console sign-in details.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="reviewer-email">
                Reviewer email
              </label>
              <Input
                id="reviewer-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="play-reviewer@aspectmarketingsolutions.app"
                autoComplete="email"
                className="h-12 text-base"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="reviewer-code">
                Access code
              </label>
              <Input
                id="reviewer-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Reviewer access code"
                type="password"
                autoComplete="one-time-code"
                className="h-12 text-base"
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button onClick={submit} disabled={busy || !code.trim()} className="w-full sm:w-auto">
                {busy ? "Opening..." : "Enter reviewer access"}
              </Button>
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link href="/pricing">View pricing</Link>
              </Button>
              <Button asChild variant="ghost" className="w-full sm:w-auto">
                <Link href={nextPath}>Continue</Link>
              </Button>
            </div>

            <div className="rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
              Safe demo org: <span className="font-medium text-foreground">ams-play-review-org</span>
              <br />
              Accessible areas: home, pricing, billing, billing success, workflows, and content agent.
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
