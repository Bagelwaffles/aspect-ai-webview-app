"use client"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
type State = { plan: { clipCursor: number; clipVodIds: string[]; clipFailures?: string[] } | null;
  jobs: Array<{ vodId: string; createdAt: string; title: string; status: string; youtubeVideoId: string | null; errorCode: string | null }> }
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
  return <Card>
    <CardHeader><CardTitle>Catch up clips & full streams</CardTitle><CardDescription>
      Best clips from the last two weeks, plus each available full stream from the past month. Full VODs include a 5-second intro, 7-second outro, the streamer’s name, and “Created by Aspect Marketing Solutions (AMS).” Uploads are verified privately first, then selected Shorts and full VODs publish automatically when automatic publishing is enabled.
    </CardDescription></CardHeader>
    <CardContent className="space-y-4">
      <Button disabled={busy} onClick={() => void start()}>{busy ? "Queueing…" : "Start two-week clips & monthly VOD catch-up"}</Button>
      {message && <p className="text-sm">{message}</p>}
      {state?.plan && <p className="text-sm">Historical stream clip review: {state.plan.clipCursor}/{state.plan.clipVodIds.length} streams completed.</p>}
      {!!state?.plan?.clipFailures?.length && <p className="text-sm text-amber-600">Clip review needs attention: {state.plan.clipFailures.join(" · ")}</p>}
      <div className="space-y-2">{state?.jobs.map(job => <div className="rounded-lg border p-3 text-sm" key={job.vodId}>
        <p>SmokyBanana03 · {job.createdAt.slice(0, 10)} · {job.title} · {job.status}</p>
        {job.errorCode && <p className="text-amber-600">{job.errorCode}</p>}
        {["verified", "published"].includes(job.status) && job.youtubeVideoId && <a className="underline" target="_blank" rel="noreferrer" href={`https://www.youtube.com/watch?v=${encodeURIComponent(job.youtubeVideoId)}`}>{job.status === "published" ? "View public full VOD" : "Review full VOD awaiting publication"}</a>}
      </div>)}</div>
      <p className="text-xs text-muted-foreground">Only recordings still available on Twitch can be recovered. Queued, failed, or reconciliation items have not been verified as successful uploads.</p>
    </CardContent>
  </Card>
}
