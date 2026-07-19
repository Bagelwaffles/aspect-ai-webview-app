"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

const ADMIN_EMAIL = "internal-admin@aspectmarketingsolutions.app"

export default function AdminLoginPage() {
  const searchParams = useSearchParams()
  const nextPath = useMemo(() => {
    const candidate = searchParams.get("next")?.trim()
    if (!candidate || !candidate.startsWith("/")) {
      return "/admin/ethical-agent-farm-requests"
    }
    return candidate
  }, [searchParams])

  const [email, setEmail] = useState(ADMIN_EMAIL)
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function submit() {
    setBusy(true)
    setError("")

    try {
      const response = await fetch("/api/internal-admin-access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code })
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
              Protected internal access for lead review and operational tools. Reviewer/demo access does not open this area.
            </p>
          </div>
          <Button asChild variant="outline" className="w-full shrink-0 sm:w-auto">
            <Link href="/">Back to dashboard</Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl sm:text-2xl">Open internal admin tools</CardTitle>
            <CardDescription className="text-sm sm:text-base">
              Enter the internal admin email and code configured for the production environment.
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
              <label className="text-sm font-medium" htmlFor="admin-code">
                Admin code
              </label>
              <Input
                id="admin-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Internal admin code"
                type="password"
                autoComplete="one-time-code"
                className="h-12 text-base"
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button onClick={submit} disabled={busy || !code.trim()} className="w-full sm:w-auto">
                {busy ? "Opening..." : "Enter admin access"}
              </Button>
              <Button asChild variant="ghost" className="w-full sm:w-auto">
                <Link href="/reviewer-access">Reviewer access</Link>
              </Button>
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
