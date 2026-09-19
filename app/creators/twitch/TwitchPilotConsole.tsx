"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { RefreshCcw, ShieldCheck, Twitch } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import TwitchMediaFactoryCard, {
  type TwitchMediaFactoryStatus,
  type TwitchShortRendererStatus,
} from "./TwitchMediaFactoryCard"

type Summary = {
  title?: string
  categoryName?: string
  durationMinutes?: number
  vod?: { id?: string; url?: string; title?: string } | null
  markers?: Array<{ id: string; description: string; positionSeconds: number; url: string }>
  clips?: Array<{ id: string; title: string; url: string; creatorName: string; viewCount: number }>
  summary?: string
  generatedAt?: string
}

type StreamIntelligence = {
  streamId: string
  phase: "live" | "post-stream"
  generatedAt: string
  generationMode: "ai-gateway" | "deterministic-fallback"
  model: string
  draft: {
    primarySearchPhrase: string
    supportingKeywords: string[]
    contentAngles: string[]
    twitch: {
      titleOptions: string[]
      tagRecommendations: string[]
      goLiveCopy: string
    }
    youtube: {
      titleOptions: string[]
      description: string
      tags: string[]
      hashtags: string[]
    }
    shortForm: {
      hooks: string[]
      captions: string[]
      hashtags: string[]
    }
    social: {
      tiktokCaption: string
      instagramCaption: string
      xPost: string
      discordAnnouncement: string
    }
    thumbnailText: string[]
    approvalNotes: string[]
    evidenceBoundary: string
  }
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
  streamIntelligence?: StreamIntelligence | null
  mediaFactory?: TwitchMediaFactoryStatus | null
  shortRenderer?: TwitchShortRendererStatus | null
}

export default function TwitchPilotConsole() {
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

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

  async function regenerateStreamIntelligence() {
    setRegenerating(true)
    try {
      const response = await fetch("/api/internal/twitch/stream-intelligence", { method: "POST" })
      if (response.ok) await refresh()
    } finally {
      setRegenerating(false)
    }
  }

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
  const intelligence = status.streamIntelligence
  const mediaFactory = status.mediaFactory ?? null
  const shortRenderer = status.shortRenderer ?? null
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

      <Card className="border-violet-500/25 bg-violet-500/5">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Stream Intelligence package</CardTitle>
              <CardDescription>
                One independent SEO/content package per Twitch stream ID. Draft-only and approval-first.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={regenerating}
              onClick={() => void regenerateStreamIntelligence()}
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              {regenerating ? "Regenerating…" : "Regenerate"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 text-sm leading-6 text-muted-foreground">
          {!intelligence ? (
            <p>
              No package has been stored yet. A genuine stream.online event creates the first live draft;
              stream.offline automatically enriches it with the post-stream evidence AMS can verify.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{intelligence.phase === "post-stream" ? "Post-stream" : "Live draft"}</Badge>
                <Badge variant="outline">
                  {intelligence.generationMode === "ai-gateway" ? "AI Gateway" : "Deterministic fallback"}
                </Badge>
                <Badge variant="outline">Stream {intelligence.streamId}</Badge>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <div className="font-semibold text-foreground">Primary search phrase</div>
                  <div>{intelligence.draft.primarySearchPhrase}</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="font-semibold text-foreground">Supporting keywords</div>
                  <div>{intelligence.draft.supportingKeywords.join(" · ")}</div>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="mb-2 font-semibold text-foreground">Twitch title options</div>
                <ol className="space-y-1">
                  {intelligence.draft.twitch.titleOptions.map((title, index) => (
                    <li key={title}>{index + 1}. {title}</li>
                  ))}
                </ol>
                <div className="mt-3 text-xs">Recommended tags: {intelligence.draft.twitch.tagRecommendations.join(" · ")}</div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="mb-2 font-semibold text-foreground">YouTube VOD package</div>
                <ol className="mb-3 space-y-1">
                  {intelligence.draft.youtube.titleOptions.map((title, index) => (
                    <li key={title}>{index + 1}. {title}</li>
                  ))}
                </ol>
                <div className="whitespace-pre-wrap text-foreground/90">{intelligence.draft.youtube.description}</div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="mb-2 font-semibold text-foreground">Short-form hooks</div>
                <ul className="space-y-1">
                  {intelligence.draft.shortForm.hooks.map((hook) => <li key={hook}>• {hook}</li>)}
                </ul>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <div className="mb-2 font-semibold text-foreground">TikTok draft</div>
                  <div>{intelligence.draft.social.tiktokCaption}</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="mb-2 font-semibold text-foreground">Instagram draft</div>
                  <div>{intelligence.draft.social.instagramCaption}</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="mb-2 font-semibold text-foreground">X draft</div>
                  <div>{intelligence.draft.social.xPost}</div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="mb-2 font-semibold text-foreground">Discord announcement</div>
                  <div>{intelligence.draft.social.discordAnnouncement}</div>
                </div>
              </div>

              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                <div className="font-semibold text-foreground">Evidence boundary</div>
                <div>{intelligence.draft.evidenceBoundary}</div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <TwitchMediaFactoryCard
        mediaFactory={mediaFactory}
        shortRenderer={shortRenderer}
        summary={summary ?? null}
        onRefresh={refresh}
      />

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
