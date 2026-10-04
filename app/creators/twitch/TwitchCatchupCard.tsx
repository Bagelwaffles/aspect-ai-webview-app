"use client"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
type State = { plan: { clipCursor: number; clipVodIds: string[]; clipFailures?: string[] } | null;
  discovery: { checkedAt: string; newlyQueued: number; completedVodCount: number } | null;
  monitoring?: { worker: { lastScheduledSucceededAt: string | null; lastErrorCode: string | null } | null; scheduledStale: boolean; stalledVodIds: string[] };
  jobs: Array<{ vodId: string; createdAt: string; updatedAt?: string; title: string; status: string; youtubeVideoId: string | null;
    errorCode: string | null; stalled?: boolean; staleForSeconds?: number; thumbnailStatus?: "pending" | "uploaded" | "failed";
    thumbnailErrorCode?: string | null }> }
const jobStatusLabel = (status: string, stalled?: boolean) => stalled ? "Stalled — needs attention" : ({
  pending: "Queued", rendering: "Rendering", uploading: "Uploading to YouTube", verified: "YouTube verified",
  published: "Public", blocked: "Queued for eligibility recheck", failed: "Failed", reconciliation: "Verifying upload state",
}[status] ?? status)

export default function TwitchCatchupCard() {
  const [state, setState] = useState<State | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  async function refresh() {
    const response = await fetch("/api/internal/twitch/catchup", { cache: "no-store" })
    const body = await response.json()
    if (response.ok) setState(body)
  }
  useEffect(() => {
    void refresh().catch(() => undefined)
    const timer = setInterval(() => { void refresh().catch(() => undefined) }, 30_000)
    return () => clearInterval(timer)
  }, [])
  async function start() {
    if (!window.confirm("Process the best clips from the last 14 days and upload each available full stream from the past month with a branded intro/outro and AMS credit? Selected Shorts and verified full VODs publish automatically when automatic publishing is enabled.")) return
    setBusy(true)
    try {
      const response = await fetch("/api/internal/twitch/catchup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approved: true }) })
      const body = await response.json()
      if (!response.ok) { setMessage(body.code ?? "Catch-up could not start."); return }
      setState(body)
      setMessage("Catch-up queued. Available recordings are processed individually; successful uploads are linked below.")
    } catch { setMessage("Catch-up could not start. Refresh to check its status before retrying.") }
    finally { setBusy(false) }
  }
  async function retryCancelled(vodId: string) {
    if (!window.confirm("Confirm the GitHub renderer was cancelled or stopped before its YouTube upload began. Requeue this recording?")) return
    setBusy(true)
    try {
      const response = await fetch("/api/internal/twitch/catchup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "retry-cancelled", approved: true, vodId }) })
      const body = await response.json()
      if (response.ok) setState(body)
      else setMessage(body.code ?? "Could not requeue the cancelled recording.")
    } catch { setMessage("Refresh to check its status before retrying.") }
    finally { setBusy(false) }
  }
  async function retryRemoved(job: NonNullable<State>["jobs"][number]) {
    if (!window.confirm("Confirm YouTube removed this video or rejected it for length. Queue a replacement that will wait for YouTube long-upload verification?")) return
    setBusy(true)
    try {
      const response = await fetch("/api/internal/twitch/catchup", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry-removed", approved: true, vodId: job.vodId, videoId: job.youtubeVideoId }) })
      const body = await response.json()
      if (response.ok) setState(body)
      else setMessage(body.code ?? "Could not requeue the removed upload.")
    } catch { setMessage("Refresh to check the removed upload before retrying.") }
    finally { setBusy(false) }
  }
  return <Card>
    <CardHeader><CardTitle>Catch up clips & full streams</CardTitle><CardDescription>
      Best clips from the last two weeks, plus each available full stream from the past month. Full VODs include a 5-second intro, 7-second outro, the streamer’s name, and “Created by Aspect Marketing Solutions (AMS).” Uploads are verified privately first, then selected Shorts and full VODs publish automatically when automatic publishing is enabled.
    </CardDescription></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm">Future completed streams from SmokyBanana03 are queued automatically. Live recordings wait until the stream ends.</p>
      {state?.discovery && <p className="text-sm text-muted-foreground">Last full-VOD discovery: {new Date(state.discovery.checkedAt).toLocaleString()} · {state.discovery.newlyQueued} newly queued · {state.discovery.completedVodCount} completed recordings found.</p>}
      <Button disabled={busy} onClick={() => void start()}>{busy ? "Queueing…" : "Start two-week clips & monthly VOD catch-up"}</Button>
      {message && <p className="text-sm">{message}</p>}
      {state?.plan && <p className="text-sm">Historical stream clip review: {state.plan.clipCursor}/{state.plan.clipVodIds.length} streams completed.</p>}
      {!!state?.plan?.clipFailures?.length && <p className="text-sm text-amber-600">Clip review needs attention: {state.plan.clipFailures.join(" · ")}</p>}
      {state?.jobs.some(job => job.status === "blocked") && <p className="text-sm text-amber-600">Full streams over 15 minutes are waiting for <a href="https://www.youtube.com/verify" target="_blank" rel="noreferrer" className="underline">YouTube phone verification</a>. They resume automatically after YouTube enables long uploads.</p>}
      <div className="space-y-2">{state?.jobs.map(job => <div className="rounded-lg border p-3 text-sm" key={job.vodId}>
        <p>SmokyBanana03 · {job.createdAt.slice(0, 10)} · {job.title} · {job.status}</p>
        {job.status === "rendering" && <Button disabled={busy} variant="outline" onClick={() => void retryCancelled(job.vodId)}>Requeue confirmed cancelled renderer</Button>}
        {job.youtubeVideoId && ["YOUTUBE_VOD_PUBLIC_PROOF_FAILED", "YOUTUBE_VOD_REMOVED_OR_UNAVAILABLE"].includes(job.errorCode ?? "") && <Button disabled={busy} variant="outline" onClick={() => void retryRemoved(job)}>Requeue confirmed removed upload</Button>}
        {job.errorCode && <p className="text-amber-600">{job.errorCode}</p>}
        {["verified", "published"].includes(job.status) && job.youtubeVideoId && <a className="underline" target="_blank" rel="noreferrer" href={`https://www.youtube.com/watch?v=${encodeURIComponent(job.youtubeVideoId)}`}>{job.status === "published" ? "View public full VOD" : "Review full VOD awaiting publication"}</a>}
      </div>)}</div>
      <p className="text-xs text-muted-foreground">Only recordings still available on Twitch can be recovered. Queued, failed, or reconciliation items have not been verified as successful uploads.</p>
    </CardContent>
  </Card>
}
