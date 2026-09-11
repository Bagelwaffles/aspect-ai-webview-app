"use client"

import { FormEvent, useEffect, useState } from "react"
import Link from "next/link"
import { Download, ExternalLink, FileUp, Globe2, Link2, RefreshCw, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

const EMPTY_PROFILE = {
  businessName: "",
  websiteUrl: "",
  audience: "",
  brandVoice: "",
  productsServices: "",
  notes: "",
}

type Profile = typeof EMPTY_PROFILE

type Asset = {
  id: string
  fileName: string
  contentType: string
  sizeBytes: number
  status: "pending" | "ready"
  createdAt: string
}

type Capabilities = {
  assetStorage: boolean
  liveResearch: boolean
  externalConnections: boolean
}

type ResearchSource = {
  title: string
  url: string
  snippet: string
  publishedDate: string | null
}

function readableBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function CustomerWorkspacePage() {
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE)
  const [assets, setAssets] = useState<Asset[]>([])
  const [capabilities, setCapabilities] = useState<Capabilities>({
    assetStorage: false,
    liveResearch: false,
    externalConnections: false,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState("")
  const [researchQuery, setResearchQuery] = useState("")
  const [researching, setResearching] = useState(false)
  const [researchSources, setResearchSources] = useState<ResearchSource[]>([])
  const [researchedAt, setResearchedAt] = useState<string | null>(null)
  const [needsSignIn, setNeedsSignIn] = useState(false)

  async function loadWorkspace() {
    setLoading(true)
    setMessage("")
    try {
      const response = await fetch("/api/customer/workspace", { cache: "no-store" })
      const data = await response.json().catch(() => null)
      if (response.status === 401) {
        setNeedsSignIn(true)
        return
      }
      if (!response.ok || !data?.workspace) throw new Error("Workspace unavailable")
      setNeedsSignIn(false)
      setProfile({ ...EMPTY_PROFILE, ...data.workspace.profile })
      setAssets(data.workspace.assets ?? [])
      setCapabilities(data.workspace.capabilities ?? capabilities)
    } catch {
      setMessage("Customer workspace is temporarily unavailable.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadWorkspace()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage("")
    try {
      const response = await fetch("/api/customer/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.profile) throw new Error("Save failed")
      setProfile(data.profile)
      setMessage("Business context saved. Eligible agents can use this shared workspace context.")
    } catch {
      setMessage("Business context could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  async function uploadOne(file: File) {
    const prepare = await fetch("/api/customer/assets/presign-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      }),
    })
    const prepared = await prepare.json().catch(() => null)
    if (!prepare.ok || !prepared?.upload?.url || !prepared?.asset?.id) {
      throw new Error(prepared?.error || "Upload could not be prepared")
    }

    const uploadResponse = await fetch(prepared.upload.url, {
      method: "PUT",
      headers: prepared.upload.requiredHeaders,
      body: file,
    })
    if (!uploadResponse.ok) throw new Error("File transfer failed")

    const complete = await fetch("/api/customer/assets/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId: prepared.asset.id }),
    })
    const completed = await complete.json().catch(() => null)
    if (!complete.ok || !completed?.asset) {
      throw new Error(completed?.error || "Upload verification failed")
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    setMessage("")
    try {
      for (const file of Array.from(files)) {
        await uploadOne(file)
      }
      setMessage(`${files.length} file${files.length === 1 ? "" : "s"} uploaded and verified.`)
      await loadWorkspace()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "File upload failed.")
    } finally {
      setUploading(false)
    }
  }

  async function downloadAsset(asset: Asset) {
    setMessage("")
    try {
      const response = await fetch(`/api/customer/assets/download?assetId=${encodeURIComponent(asset.id)}`, {
        cache: "no-store",
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.downloadUrl) throw new Error(data?.error || "Download unavailable")
      window.location.assign(data.downloadUrl)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Download unavailable.")
    }
  }

  async function runResearch(event: FormEvent) {
    event.preventDefault()
    if (!researchQuery.trim()) return
    setResearching(true)
    setMessage("")
    setResearchSources([])
    try {
      const response = await fetch("/api/customer/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: researchQuery, topic: "general", maxResults: 5 }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.research) throw new Error(data?.error || "Research unavailable")
      setResearchSources(data.research.sources ?? [])
      setResearchedAt(data.research.researchedAt ?? null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Research unavailable.")
    } finally {
      setResearching(false)
    }
  }

  if (needsSignIn) {
    return (
      <main className="mx-auto max-w-3xl p-6 py-16">
        <Card>
          <CardHeader>
            <CardTitle>Customer sign in required</CardTitle>
            <CardDescription>Your workspace is private to your AMS customer account.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/api/auth/signin?callbackUrl=/workspace">Customer sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 py-8 md:p-6">
      <div className="space-y-2">
        <p className="text-sm font-medium text-primary">AMS Customer Workspace</p>
        <h1 className="text-3xl font-bold">Give your agents real business context</h1>
        <p className="max-w-3xl text-muted-foreground">
          Save your business profile once, keep private files in one place, and run source-backed live research. Customer assets and research are never public by default.
        </p>
      </div>

      {message ? <div className="rounded-lg border bg-card p-3 text-sm">{message}</div> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Business context</CardTitle>
            <CardDescription>Shared customer-provided context for eligible AMS agents.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={saveProfile}>
              <div className="space-y-2">
                <Label htmlFor="businessName">Business name</Label>
                <Input id="businessName" value={profile.businessName} onChange={(e) => setProfile({ ...profile, businessName: e.target.value })} maxLength={120} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="websiteUrl">Website</Label>
                <Input id="websiteUrl" type="url" placeholder="https://example.com" value={profile.websiteUrl} onChange={(e) => setProfile({ ...profile, websiteUrl: e.target.value })} maxLength={500} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="audience">Audience</Label>
                <Textarea id="audience" value={profile.audience} onChange={(e) => setProfile({ ...profile, audience: e.target.value })} maxLength={500} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brandVoice">Brand voice</Label>
                <Textarea id="brandVoice" value={profile.brandVoice} onChange={(e) => setProfile({ ...profile, brandVoice: e.target.value })} maxLength={500} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="productsServices">Products and services</Label>
                <Textarea id="productsServices" value={profile.productsServices} onChange={(e) => setProfile({ ...profile, productsServices: e.target.value })} maxLength={1500} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Other context</Label>
                <Textarea id="notes" value={profile.notes} onChange={(e) => setProfile({ ...profile, notes: e.target.value })} maxLength={2000} />
              </div>
              <Button type="submit" disabled={saving || loading}>
                {saving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save context
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Private asset vault</CardTitle>
              <CardDescription>Photos, PDFs, documents, spreadsheets, audio and video up to 250 MB each.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!capabilities.assetStorage ? (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                  Storage is fail-closed until the AMS R2 bucket credentials are configured in production.
                </div>
              ) : null}
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center">
                <FileUp className="mb-2 h-7 w-7" />
                <span className="font-medium">{uploading ? "Uploading and verifying…" : "Choose files"}</span>
                <span className="text-xs text-muted-foreground">Files upload directly to private object storage with a short-lived signed URL.</span>
                <input
                  className="hidden"
                  type="file"
                  multiple
                  disabled={!capabilities.assetStorage || uploading}
                  accept="image/*,audio/*,video/*,.pdf,.txt,.md,.csv,.json,.docx,.xlsx,.pptx,.zip"
                  onChange={(event) => void handleFiles(event.target.files)}
                />
              </label>
              <div className="space-y-2">
                {assets.length === 0 ? <p className="text-sm text-muted-foreground">No customer assets uploaded yet.</p> : null}
                {assets.map((asset) => (
                  <div key={asset.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{asset.fileName}</p>
                      <p className="text-xs text-muted-foreground">{readableBytes(asset.sizeBytes)} · {asset.status}</p>
                    </div>
                    <Button variant="outline" size="sm" disabled={asset.status !== "ready"} onClick={() => void downloadAsset(asset)}>
                      <Download className="mr-1 h-4 w-4" /> Download
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Globe2 className="h-5 w-5" /> Live research</CardTitle>
              <CardDescription>Current web research returns sources and retrieval time so agents can distinguish live facts from model knowledge.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!capabilities.liveResearch ? (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                  Live research is fail-closed until the production Tavily key is configured.
                </div>
              ) : null}
              <form className="flex gap-2" onSubmit={runResearch}>
                <Input value={researchQuery} onChange={(e) => setResearchQuery(e.target.value)} placeholder="Research a current market, competitor, platform change…" maxLength={500} disabled={!capabilities.liveResearch} />
                <Button type="submit" disabled={!capabilities.liveResearch || researching || !researchQuery.trim()}>
                  {researching ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Search"}
                </Button>
              </form>
              {researchedAt ? <p className="text-xs text-muted-foreground">Researched {new Date(researchedAt).toLocaleString()} · {researchSources.length} sources</p> : null}
              <div className="space-y-3">
                {researchSources.map((source) => (
                  <div key={source.url} className="rounded-lg border p-3">
                    <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline">
                      {source.title}<ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    {source.publishedDate ? <p className="mt-1 text-xs text-muted-foreground">Published: {source.publishedDate}</p> : null}
                    <p className="mt-2 text-sm text-muted-foreground">{source.snippet}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Link2 className="h-5 w-5" /> External accounts</CardTitle>
              <CardDescription>OAuth connections will be enabled provider-by-provider with least-privilege scopes and separate read/action permissions.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2">
                {["Google Drive", "YouTube", "Facebook / Instagram", "LinkedIn", "Shopify", "WordPress", "Slack", "Google Business Profile"].map((provider) => (
                  <div key={provider} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                    <span>{provider}</span>
                    <span className="text-xs text-muted-foreground">Setup required</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                No provider is represented as connected until its OAuth grant, encrypted token storage, scope verification and disconnect flow are production-proven.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
