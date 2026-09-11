"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { HardDrive, RefreshCw, ShieldCheck, Unplug } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type DriveConnection = {
  provider: "google-drive"
  accountLabel: string
  scopes: string[]
  status: "active" | "expired" | "error"
  connectedAt: string
  updatedAt: string
}

type DriveStatus = {
  configured: boolean
  connected: boolean
  connection: DriveConnection | null
  scopeModel?: string
}

export default function GoogleDriveWorkspacePage() {
  const [status, setStatus] = useState<DriveStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)
  const [needsSignIn, setNeedsSignIn] = useState(false)
  const [message, setMessage] = useState("")

  async function loadStatus() {
    setLoading(true)
    setMessage("")
    try {
      const response = await fetch("/api/customer/connections/google-drive/status", { cache: "no-store" })
      const data = await response.json().catch(() => null)
      if (response.status === 401) {
        setNeedsSignIn(true)
        return
      }
      if (!response.ok || !data) throw new Error("Google Drive status unavailable")
      setNeedsSignIn(false)
      setStatus({
        configured: Boolean(data.configured),
        connected: Boolean(data.connected),
        connection: data.connection ?? null,
        scopeModel: data.scopeModel,
      })
    } catch {
      setMessage("Google Drive connection status is temporarily unavailable.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadStatus()
  }, [])

  async function disconnect() {
    setDisconnecting(true)
    setMessage("")
    try {
      const response = await fetch("/api/customer/connections/google-drive/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.code || "Disconnect failed")
      setMessage("Google Drive access was revoked and disconnected from AMS.")
      await loadStatus()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Google Drive could not be disconnected.")
    } finally {
      setDisconnecting(false)
    }
  }

  if (needsSignIn) {
    return (
      <main className="mx-auto max-w-3xl p-6 py-16">
        <Card>
          <CardHeader>
            <CardTitle>Customer sign in required</CardTitle>
            <CardDescription>Google Drive connections are private to the signed AMS customer account.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild><Link href="/api/auth/signin?callbackUrl=/workspace/google-drive">Sign in</Link></Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 py-10 md:p-6">
      <div className="space-y-2">
        <p className="text-sm font-medium text-primary">AMS Customer Workspace</p>
        <h1 className="flex items-center gap-2 text-3xl font-bold"><HardDrive className="h-7 w-7" /> Google Drive</h1>
        <p className="text-muted-foreground">
          Connect only the files you deliberately choose for AMS. This connector uses Google&apos;s least-privilege <code>drive.file</code> scope rather than broad access to your Drive.
        </p>
      </div>

      {message ? <div className="rounded-lg border bg-card p-3 text-sm">{message}</div> : null}

      <Card>
        <CardHeader>
          <CardTitle>Connection</CardTitle>
          <CardDescription>OAuth tokens stay encrypted server-side and are never exposed to AMS agent prompts or the browser.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" /> Checking connection…</div>
          ) : !status?.configured ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
              <p className="font-medium">Setup required</p>
              <p className="mt-1 text-muted-foreground">The production Google Drive OAuth client and encrypted connection vault must be configured before customers can connect.</p>
            </div>
          ) : status.connected && status.connection ? (
            <div className="space-y-4">
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 font-medium"><ShieldCheck className="h-4 w-4" /> Connected</div>
                <p className="mt-2 text-sm text-muted-foreground">{status.connection.accountLabel || "Google Drive"}</p>
                <p className="mt-1 text-xs text-muted-foreground">Scope model: {status.scopeModel || "drive.file"}</p>
              </div>
              <Button variant="outline" onClick={() => void disconnect()} disabled={disconnecting}>
                {disconnecting ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Unplug className="mr-2 h-4 w-4" />}
                Revoke and disconnect
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                AMS will request identity plus <code>drive.file</code>. It will not request broad <code>drive.readonly</code> or full-Drive access.
              </div>
              <Button asChild><a href="/api/customer/connections/google-drive/start">Connect Google Drive</a></Button>
            </div>
          )}

          <Button variant="ghost" asChild><Link href="/workspace">Back to workspace</Link></Button>
        </CardContent>
      </Card>
    </main>
  )
}
