"use client"

import { useState } from "react"
import { Download, Film, RefreshCcw, Scissors } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export type TwitchMediaFactoryStatus = {
  streamId: string
  mediaAuthorized: boolean
  generatedAt: string
  items: Array<{
    clipId: string
    title: string
    twitchUrl: string
    status: "discovered" | "short-ready" | "landscape-ready"
    orientation: "portrait" | "landscape" | null
    shortDraft: {
      title: string
      hook: string
      caption: string
      hashtags: string[]
    }
  }>
}

type Summary = {
  title?: string
  categoryName?: string
  vod?: { id?: string; url?: string } | null
  markers?: Array<{ id: string; description: string; positionSeconds: number; url: string }>
} | null

export default function TwitchMediaFactoryCard({
  mediaFactory,
  summary,
  onRefresh,
}: {
  mediaFactory: TwitchMediaFactoryStatus | null
  summary: Summary
  onRefresh: () => Promise<void>
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function refreshQueue() {
    setBusy("refresh")
    setMessage(null)
    try {
      const response = await fetch("/api/internal/twitch/media/refresh", { method: "POST" })
      const body = await response.json().catch(() => null) as { code?: string } | null
      setMessage(response.ok ? "Clip queue refreshed." : body?.code ?? "Clip queue refresh failed.")
      if (response.ok) await onRefresh()
    } finally {
      setBusy(null)
    }
  }

  async function importClip(clipId: string) {
    setBusy(clipId)
    setMessage(null)
    try {
      const response = await fetch("/api/internal/twitch/media/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clipId }),
      })
      const body = await response.json().catch(() => null) as { code?: string; item?: { status?: string } } | null
      if (response.ok) {
        setMessage(body?.item?.status === "short-ready"
          ? "Portrait clip imported to AMS and is Short-ready."
          : "Landscape clip imported to AMS. Vertical rendering is still required.")
        await onRefresh()
      } else {
        setMessage(body?.code ?? "Clip import failed.")
      }
    } finally {
      setBusy(null)
    }
  }

  async function createFromMarker(marker: NonNullable<Summary>["markers"][number]) {
    if (!summary?.vod?.id) return
    if (!window.confirm("Create a real Twitch clip from this stream marker? This will add a clip to the connected Twitch channel.")) return
    const duration = Math.min(30, Math.max(5, marker.positionSeconds))
    const title = (marker.description || `${summary.categoryName || "Gaming"} highlight`).slice(0, 100)
    setBusy(`marker:${marker.id}`)
    setMessage(null)
    try {
      const response = await fetch("/api/internal/twitch/media/create-vod-clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approved: true,
          vodId: summary.vod.id,
          vodOffset: marker.positionSeconds,
          duration,
          title,
        }),
      })
      const body = await response.json().catch(() => null) as { code?: string; clip?: { id?: string } } | null
      setMessage(response.ok
        ? `Twitch accepted clip creation${body?.clip?.id ? ` (${body.clip.id})` : ""}. Refresh after Twitch finishes processing it.`
        : body?.code ?? "Twitch clip creation failed.")
    } finally {
      setBusy(null)
    }
  }

  const authorized = mediaFactory?.mediaAuthorized ?? false

  return (
    <Card className="border-fuchsia-500/25 bg-fuchsia-500/5">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Clip & Shorts Factory</CardTitle>
            <CardDescription>
              Approval-first Twitch clip creation, official media import, and per-clip Shorts metadata.
            </CardDescription>
          </div>
          <Badge variant="outline">{authorized ? "Media authorized" : "Media scope required"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 text-sm leading-6 text-muted-foreground">
        {!authorized ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="mb-3">
              The existing Twitch connection remains read-only. Enabling the factory adds only the
              channel:manage:clips permission used by Twitch&apos;s official VOD clip and clip-download APIs.
            </p>
            <Button asChild>
              <a href="/api/internal/twitch/start?capability=media"><Film className="mr-2 h-4 w-4" />Enable Clip Factory</a>
            </Button>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={busy === "refresh"} onClick={() => void refreshQueue()}>
            <RefreshCcw className="mr-2 h-4 w-4" />{busy === "refresh" ? "Refreshing…" : "Refresh clips"}
          </Button>
          <span>No automatic posting, messaging, moderation, or spending is enabled.</span>
        </div>

        {message ? <div className="rounded-lg border p-3 text-foreground">{message}</div> : null}

        {summary?.vod?.id && (summary.markers?.length ?? 0) > 0 ? (
          <div className="rounded-lg border p-4">
            <div className="mb-2 font-semibold text-foreground">Create Twitch clips from creator markers</div>
            <div className="space-y-2">
              {summary!.markers!.map((marker) => (
                <div key={marker.id} className="flex flex-wrap items-center justify-between gap-3">
                  <span>{marker.positionSeconds}s · {marker.description || "Creator marker"}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!authorized || marker.positionSeconds < 5 || busy === `marker:${marker.id}`}
                    onClick={() => void createFromMarker(marker)}
                  >
                    <Scissors className="mr-2 h-4 w-4" />Create clip
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {(mediaFactory?.items.length ?? 0) === 0 ? (
          <p>
            No clip candidates are archived for the latest completed stream yet. After stream.offline,
            AMS discovers Twitch clips and creates one independent Shorts package per clip.
          </p>
        ) : (
          <div className="space-y-3">
            {mediaFactory!.items.map((item) => (
              <div key={item.clipId} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-foreground">{item.title || item.shortDraft.title}</div>
                    <div className="text-xs">{item.clipId}</div>
                  </div>
                  <Badge variant="outline">
                    {item.status === "short-ready" ? "Short-ready" : item.status === "landscape-ready" ? "Landscape imported" : "Discovered"}
                  </Badge>
                </div>
                <div className="mt-3 space-y-2">
                  <div><span className="font-medium text-foreground">Hook:</span> {item.shortDraft.hook}</div>
                  <div><span className="font-medium text-foreground">Caption:</span> {item.shortDraft.caption}</div>
                  <div>{item.shortDraft.hashtags.join(" ")}</div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <a href={item.twitchUrl} target="_blank" rel="noreferrer">Open Twitch clip</a>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!authorized || busy === item.clipId}
                    onClick={() => void importClip(item.clipId)}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    {busy === item.clipId ? "Importing…" : item.status === "discovered" ? "Import media" : "Re-import media"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
