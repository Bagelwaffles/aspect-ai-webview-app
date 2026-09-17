"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { RefreshCcw, ShieldCheck, Twitch } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type Summary = {
  title?: string
  categoryName?: string
  durationMinutes?: number
  vod?: { url?: string; title?: string } | null
  markers?: Array<{ id: string; description: string; positionSeconds: number; url: string }>
  clips?: Array<{ id: string; title: string; url: string; creatorName: string; viewCount: number }>
  summary?: string
  generatedAt?: string
}

type Status = {
  ok: boolean
  configured?: boolean
  connected?: boolean
  code?: string
  connection?: {
    broadcasterId: string
    login: string
    displayName: string
    scopes: string[]
    connectedAt: string
  } | null
  subscription?: unknown
  session?: unknown
  summary?: Summary | null
}

export default function TwitchPilotConsole() {
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/internal/twitch/status", { cache: "no-store" })
      const body = (await response.json().catch(() => null)) as Status | null
      setStatus(body ?? { ok: false, code: `HTTP_${response.status}` })
    } catch {
      setStatus({ ok: false, code: "TWITCH_STATUS_UNAVAILABLE" })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function disconnect() {
    if (!window.confirm("Disconnect the controlled Twitch pilot and remove its EventSub subscriptions?")) return
    setDisconnecting(true)
    try {
      await fetch("/api/internal/twitch/disconnect", { method: "POST" })
      await refresh()
    } finally {
      setDisconnecting(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Checking the controlled Twitch pilot…</p>
  }

  if (!status?.ok && status?.code === "OWNER_SESSION_REQUIRED") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Owner session required</CardTitle>
          <CardDescription>This console never exposes channel authorization or pilot data publicly.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/login?callbackUrl=/creators/twitch">Sign in as AMS owner</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!status?.ok) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Twitch status unavailable</CardTitle>
          <CardDescription>{status?.code ?? "The status endpoint did not return a usable response."}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => void refresh()}><RefreshCcw className="mr-2 h-4 w-4" />Retry</Button>
        </CardContent>
      </Card>
    )
  }

  if (!status.configured) {
    return (
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader>
          <Badge variant="outline" className="w-fit border-amber-500/30 text-amber-300">Setup required</Badge>
          <CardTitle>Twitch application credentials are not configured yet.</CardTitle>
          <CardDescription>
            The runtime is fail-closed. AMS needs its registered Twitch application client ID/secret, an EventSub signing secret, and the existing encrypted connection vault before the owner can authorize a channel.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-muted-foreground">
          Registered callback: <code className="text-foreground">https://www.aspectmarketingsolutions.app/api/internal/twitch/callback</code>
        </CardContent>
      </Card>
    )
  }

  if (!status.connected) {
    return (
      <Card className="border-primary/25 bg-primary/5">
        <CardHeader>
          <Badge variant="outline" className="w-fit border-primary/30 bg-primary/10 text-primary">Ready to authorize</Badge>
          <CardTitle>Connect one controlled Twitch channel.</CardTitle>
          <CardDescription>
            AMS requests only the read-only user:read:broadcast scope. Publishing, chat, moderation, spending, and account mutation remain outside this pilot.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild><a href="/api/internal/twitch/start"><Twitch className="mr-2 h-4 w-4" />Connect Twitch</a></Button>
        </CardContent>
      </Card>
    )
  }

  const summary = status.summary
  return (
    <div className="space-y-6">
      <Card className="border-primary/25 bg-primary/5">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">Connected pilot</Badge>
            <Button variant="outline" size="sm" onClick={() => void refresh()}><RefreshCcw className="mr-2 h-4 w-4" />Refresh</Button>
          </div>
          <CardTitle>{status.connection?.displayName ?? status.connection?.login}</CardTitle>
          <CardDescription>@{status.connection?.login} · read-only Twitch authorization</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
          <div className="flex gap-2"><ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-primary" /><span>Requested scope: {status.connection?.scopes.join(", ")}</span></div>
          <p>EventSub is limited to stream online/offline and channel metadata updates. No automatic publishing, chat, moderation, or account changes are enabled.</p>
          <Button variant="outline" disabled={disconnecting} onClick={() => void disconnect()}>{disconnecting ? "Disconnecting…" : "Disconnect Twitch"}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Latest source-backed stream summary</CardTitle>
          <CardDescription>Built from Twitch metadata, VOD references, creator markers, and Twitch clips—not invented gameplay analysis.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
          {!summary ? (
            <p>No completed stream summary has been recorded yet. The first verified online → offline event cycle will populate this section.</p>
          ) : (
            <>
              <p className="text-foreground">{summary.summary}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border p-4"><div className="font-semibold text-foreground">Title</div><div>{summary.title || "Not provided"}</div></div>
                <div className="rounded-lg border p-4"><div className="font-semibold text-foreground">Category</div><div>{summary.categoryName || "Not provided"}</div></div>
                <div className="rounded-lg border p-4"><div className="font-semibold text-foreground">Duration</div><div>{summary.durationMinutes ?? 0} minutes</div></div>
                <div className="rounded-lg border p-4"><div className="font-semibold text-foreground">Clip evidence</div><div>{summary.clips?.length ?? 0} clips · {summary.markers?.length ?? 0} markers</div></div>
              </div>
              {summary.vod?.url ? <Button asChild variant="outline"><a href={summary.vod.url} target="_blank" rel="noreferrer">Open Twitch VOD</a></Button> : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
