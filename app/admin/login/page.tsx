"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { safeRelativeCallbackPath } from "@/app/lib/safe-relative-callback"

const ADMIN_EMAIL = "internal-admin@aspectmarketingsolutions.app"

export default function AdminLoginPage() {
  const searchParams = useSearchParams()
  const nextPath = useMemo(() => {
    return safeRelativeCallbackPath(
      searchParams.get("next"),
      "/admin/ethical-agent-farm-requests",
    )
  }, [searchParams])

  const ownerLoginHref = `/api/operator/session?next=${encodeURIComponent(nextPath)}`

  const [email, setEmail] = useState(ADMIN_EMAIL)
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function submit() {
    setBusy(true)
    setError("")

    try {
      const response = await fetch("/api/internal-admin-access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password })
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setError(payload?.error || "Unable to open admin access.")
        return
      }

      window.location.href = nextPath
    } catch {
      setError("Unable to open admin access.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 sm:max-w-2xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold leading-tight sm:text-3xl">Admin Access</h1>
            <p className="max-w-prose text-sm text-muted-foreground sm:text-base">
              Protected internal access for AMS owner operations. The owner account signs in through Google; the password form below is a separate legacy fallback.
            </p>
          </div>
          <Button asChild variant="outline" className="w-full shrink-0 sm:w-auto">
            <Link href="/">Back to dashboard</Link>
          </Button>
        </div>

        <Card className="border-primary/40 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-xl sm:text-2xl">AMS owner login</CardTitle>
            <CardDescription className="text-sm sm:text-base">
              Use the Google account configured as the AMS owner. No internal-admin password is required for the owner login path.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full sm:w-auto">
              <Link href={ownerLoginHref}>Continue with Google owner login</Link>
            </Button>
            <p className="text-xs text-muted-foreground">
              AMS now completes owner elevation through a server-side session bridge, then returns you to the requested dashboard page.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl sm:text-2xl">Legacy internal admin login</CardTitle>
            <CardDescription className="text-sm sm:text-base">
              Use this only if a separate internal-admin email and password hash have been deliberately configured for the environment.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="admin-email">
                Admin email
              </label>
              <Input
                id="admin-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={ADMIN_EMAIL}
                autoComplete="email"
                className="h-12 text-base"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="admin-password">
                Admin password
              </label>
              <Input
                id="admin-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Internal admin password"
                type="password"
                autoComplete="current-password"
                className="h-12 text-base"
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button onClick={submit} disabled={busy || !password} className="w-full sm:w-auto" variant="outline">
                {busy ? "Opening..." : "Enter legacy admin access"}
              </Button>
              <Button asChild variant="ghost" className="w-full sm:w-auto">
                <Link href="/reviewer-access">Reviewer access</Link>
              </Button>
            </div>

            {error ? (
              <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm text-destructive">{error}</p>
                {error === "internal_admin_access_not_configured" ? (
                  <p className="text-xs text-muted-foreground">
                    The legacy password login is not configured. Use the Google owner login above instead.
                  </p>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
