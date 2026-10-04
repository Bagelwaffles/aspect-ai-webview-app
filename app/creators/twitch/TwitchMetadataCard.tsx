"use client"
import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type Channel = { login: string; title: string; category: string; language: string; tags: string[]; canEdit: boolean }
export default function TwitchMetadataCard() {
  const [channel, setChannel] = useState<Channel | null>(null)
  const [title, setTitle] = useState("")
  const [tags, setTags] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [automation, setAutomation] = useState<{ status: string; code: string | null; updatedAt: string } | null>(null)
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/internal/twitch/metadata", { cache: "no-store" })
      const data = await response.json()
      if (!data.ok) { setMessage(data.code); return }
      setChannel(data.channel); setTitle(data.channel.title); setTags(data.channel.tags.join(", "))
      setAutomation(data.automation ?? null)
    } catch { setMessage("Channel details are temporarily unavailable.") }
  }, [])
  useEffect(() => { void load() }, [load])
  async function save() {
    setBusy(true); setMessage("")
    try {
      const response = await fetch("/api/internal/twitch/metadata", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, tags: tags.split(",").map(tag => tag.trim()).filter(Boolean) }) })
      const data = await response.json()
      if (!data.ok) { setMessage(data.code); return }
      setChannel(data.channel); setTitle(data.channel.title); setTags(data.channel.tags.join(", ")); setMessage("Saved and verified on Twitch.")
    } catch { setMessage("Could not verify the update. Refresh before retrying.") }
    finally { setBusy(false) }
  }
  return <Card className="border-violet-500/25">
    <CardHeader><CardTitle>Twitch title & tags</CardTitle><CardDescription>Edit SmokyBanana03’s current stream details on Twitch. Each save is verified against the channel.</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      {channel && <p className="text-sm text-muted-foreground">@{channel.login} · {channel.category || "No category"} · {channel.language}</p>}
      {channel?.canEdit && <p className="text-sm">Automatic titles and tags are enabled for SmokyBanana03 at go-live. Later manual edits are preserved. Completed full streams are discovered automatically and queued with the branded intro and outro.</p>}
      {automation && <p className="text-sm text-muted-foreground" role="status">Latest automatic title/tag update: {automation.status}{automation.code ? ` · ${automation.code}` : ""} · {new Date(automation.updatedAt).toLocaleString()}</p>}
      {channel && !channel.canEdit && <div className="space-y-2"><p className="text-sm text-muted-foreground">Authorize Twitch broadcast editing for SmokyBanana03 to save titles and tags. Existing clip access is retained.</p><Button asChild><a href="/api/internal/twitch/start?capability=metadata">Enable Twitch title & tag editing</a></Button></div>}
      <label className="block text-sm">Stream title<input className="mt-2 w-full rounded-md border border-input bg-background p-3" value={title} maxLength={140} onChange={event => setTitle(event.target.value)} disabled={busy || !channel?.canEdit} /></label>
      <label className="block text-sm">Tags, separated by commas<input className="mt-2 w-full rounded-md border border-input bg-background p-3" value={tags} onChange={event => setTags(event.target.value)} disabled={busy || !channel?.canEdit} /><span className="mt-1 block text-xs text-muted-foreground">Up to 10 tags, each up to 25 letters or numbers. No spaces inside a tag.</span></label>
      <div className="flex gap-3"><Button onClick={() => void save()} disabled={busy || !channel?.canEdit || !title.trim()}>{busy ? "Saving…" : "Save to SmokyBanana03"}</Button><Button variant="outline" onClick={() => void load()} disabled={busy}>Refresh channel details</Button></div>
      {message && <p role="status" className="text-sm">{message}</p>}
    </CardContent>
  </Card>
}
