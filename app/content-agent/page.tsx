"use client"

import { FormEvent, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, FileText, History, Loader2, Send } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { isContentAgentLaunchEnabled } from "@/lib/content-agent-launch"

type RunStatus = "queued" | "running" | "succeeded" | "failed" | "refunded" | "reconciliation"

type ContentRun = {
  id: string
  input: {
    businessName: string
    audience: string
    goal: string
    channel: "website" | "email" | "social" | "blog" | "advertisement"
    tone: "professional" | "friendly" | "confident" | "educational" | "conversational"
    offer?: string
  }
  status: RunStatus
  creditState: string
  output: {
    headline: string
    body: string
    callToAction: string
    safetyNotes: string[]
  } | null
  errorCode: string | null
  createdAt: string
  updatedAt: string
}

type RunsResponse = {
  ok?: boolean
  runs?: ContentRun[]
  run?: ContentRun
  code?: string
  error?: string
}

const initialBrief: ContentRun["input"] = {
  businessName: "",
  audience: "",
  goal: "",
  channel: "social",
  tone: "professional",
  offer: "",
}

const statusLabels: Record<RunStatus, string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Completed",
  failed: "Failed",
  refunded: "Refunded",
  reconciliation: "Needs review",
}

function statusVariant(status: RunStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "succeeded") return "default"
  if (status === "failed" || status === "reconciliation") return "destructive"
  if (status === "refunded") return "outline"
  return "secondary"
}

function createRequestKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `content-${crypto.randomUUID()}`
    : `content-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`
}

function readableError(body: RunsResponse, fallback: string): string {
  return `${body.code ? `${body.code}: ` : ""}${body.error || fallback}`
}

function shouldRetrySameOperation(status: number, code: string | undefined): boolean {
  return (
    status === 202 ||
    [
      "RATE_LIMIT_UNAVAILABLE",
      "CONTENT_RUN_STORE_UNAVAILABLE",
      "CREDIT_RESERVATION_FAILED",
      "CREDIT_REFUND_FAILED",
      "CREDIT_COMMIT_AND_REFUND_FAILED",
      "CONTENT_RUN_RECONCILIATION_REQUIRED",
      "FINAL_PERSISTENCE_FAILED",
    ].includes(code ?? "")
  )
}

export default function ContentAgentPage() {
  const launchEnabled = isContentAgentLaunchEnabled()
  const [brief, setBrief] = useState<ContentRun["input"]>(initialBrief)
  const [runs, setRuns] = useState<ContentRun[]>([])
  const [result, setResult] = useState<ContentRun | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [requestKey, setRequestKey] = useState<string | null>(null)

  function updateBrief(patch: Partial<ContentRun["input"]>) {
    setBrief((current) => ({ ...current, ...patch }))
    setRequestKey(null)
    setSubmitError(null)
  }

  const loadRuns = useCallback(async () => {
    setIsLoadingHistory(true)
    try {
      const response = await fetch("/api/content-agent/runs", { cache: "no-store" })
      const body = (await response.json().catch(() => ({}))) as RunsResponse
      if (!response.ok) {
        setRuns([])
        setHistoryError(readableError(body, "Recent runs are unavailable."))
        return
      }
      setRuns(Array.isArray(body.runs) ? body.runs : [])
      setHistoryError(null)
    } catch {
      setRuns([])
      setHistoryError("Recent runs could not be loaded.")
    } finally {
      setIsLoadingHistory(false)
    }
  }, [])

  useEffect(() => {
    void loadRuns()
  }, [loadRuns])

  async function submitBrief(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!launchEnabled) {
      setSubmitError("CONTENT_AGENT_TEMPORARILY_UNAVAILABLE: Execution is paused. Your brief remains editable and no credit was reserved or charged.")
      return
    }
    if (isSubmitting) return

    setIsSubmitting(true)
    setSubmitError(null)
    setResult(null)
    const operationKey = requestKey ?? createRequestKey()
    setRequestKey(operationKey)
    try {
      const response = await fetch("/api/content-agent/runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": operationKey,
        },
        body: JSON.stringify({
          ...brief,
          ...(brief.offer?.trim() ? { offer: brief.offer } : { offer: undefined }),
        }),
      })
      const body = (await response.json().catch(() => ({}))) as RunsResponse
      if (!response.ok || !body.run || body.run.status !== "succeeded" || !body.run.output) {
        setSubmitError(readableError(body, `Content generation failed (${response.status}).`))
        if (!shouldRetrySameOperation(response.status, body.code)) setRequestKey(null)
        await loadRuns()
        return
      }
      setResult(body.run)
      setRequestKey(null)
      await loadRuns()
    } catch {
      setSubmitError("NETWORK_ERROR: Retry to safely reuse the same content run idempotency key.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <Badge variant={launchEnabled ? "secondary" : "outline"} className="w-fit">
              {launchEnabled ? "Subscription workflow" : "Execution paused — brief remains editable"}
            </Badge>
            <div>
              <h1 className="text-2xl font-bold sm:text-3xl">Content Agent</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                Generate one structured marketing draft from a focused brief. Output appears only after validation, protected credit handling, and safe persistence.
              </p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link href="/"><ArrowLeft className="mr-2 h-4 w-4" />Dashboard</Link>
            </Button>
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link href="/billing">Billing</Link>
            </Button>
          </div>
        </header>

        {!launchEnabled ? (
          <Card className="border-amber-500/40 bg-amber-500/10">
            <CardHeader>
              <CardTitle>Content Agent execution is temporarily unavailable</CardTitle>
              <CardDescription>
                You can still type, paste, and edit the complete brief below on mobile. The Generate button stays disabled until execution is available, so no credit can be reserved or charged accidentally.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/ethical-agent-farm/request?offer=content-agent-beta">Join the beta list</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/pricing">View available request-based services</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <section className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Content brief</CardTitle>
              <CardDescription>
                {launchEnabled
                  ? "Tap any field to type or paste. Generation requires a signed-in customer, active Content Agent access, available distributed services, and one credit."
                  : "Tap any field to type or paste. Brief entry remains fully editable; only generation is unavailable."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-5" onSubmit={submitBrief} autoComplete="on">
                <fieldset className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="businessName">Business name</Label>
                    <Input
                      id="businessName"
                      name="businessName"
                      value={brief.businessName}
                      onChange={(event) => updateBrief({ businessName: event.target.value })}
                      autoComplete="organization"
                      inputMode="text"
                      minLength={2}
                      maxLength={120}
                      required
                      className="h-11 text-base"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="audience">Audience</Label>
                    <Textarea
                      id="audience"
                      name="audience"
                      value={brief.audience}
                      onChange={(event) => updateBrief({ audience: event.target.value })}
                      placeholder="Who should this content help or reach?"
                      autoCapitalize="sentences"
                      spellCheck
                      minLength={3}
                      maxLength={500}
                      required
                      className="min-h-24 text-base"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="goal">Goal</Label>
                    <Textarea
                      id="goal"
                      name="goal"
                      value={brief.goal}
                      onChange={(event) => updateBrief({ goal: event.target.value })}
                      placeholder="What should the draft communicate or encourage?"
                      autoCapitalize="sentences"
                      spellCheck
                      minLength={3}
                      maxLength={500}
                      required
                      className="min-h-24 text-base"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="channel">Channel</Label>
                      <select
                        id="channel"
                        name="channel"
                        value={brief.channel}
                        onChange={(event) => updateBrief({ channel: event.target.value as ContentRun["input"]["channel"] })}
                        className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base"
                      >
                        <option value="website">Website</option>
                        <option value="email">Email</option>
                        <option value="social">Social post</option>
                        <option value="blog">Blog</option>
                        <option value="advertisement">Advertisement</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tone">Tone</Label>
                      <select
                        id="tone"
                        name="tone"
                        value={brief.tone}
                        onChange={(event) => updateBrief({ tone: event.target.value as ContentRun["input"]["tone"] })}
                        className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base"
                      >
                        <option value="professional">Professional</option>
                        <option value="friendly">Friendly</option>
                        <option value="confident">Confident</option>
                        <option value="educational">Educational</option>
                        <option value="conversational">Conversational</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="offer">Offer (optional)</Label>
                    <Textarea
                      id="offer"
                      name="offer"
                      value={brief.offer ?? ""}
                      onChange={(event) => updateBrief({ offer: event.target.value })}
                      placeholder="Include only an offer that is currently accurate."
                      autoCapitalize="sentences"
                      spellCheck
                      maxLength={500}
                      className="min-h-20 text-base"
                    />
                  </div>
                </fieldset>

                {submitError ? (
                  <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    {submitError}
                  </div>
                ) : null}

                <Button type="submit" disabled={!launchEnabled || isSubmitting} className="h-11 w-full sm:w-auto">
                  {isSubmitting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating</>
                  ) : launchEnabled ? (
                    <><Send className="mr-2 h-4 w-4" />Generate draft</>
                  ) : (
                    "Execution paused — no charge"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl"><FileText className="h-5 w-5" />Generated draft</CardTitle>
                <CardDescription>Only validated, committed output appears here.</CardDescription>
              </CardHeader>
              <CardContent>
                {result?.output ? (
                  <div className="space-y-5">
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">Headline</p>
                      <h2 className="mt-1 break-words text-lg font-semibold">{result.output.headline}</h2>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">Body</p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{result.output.body}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">Call to action</p>
                      <p className="mt-1 break-words text-sm font-medium">{result.output.callToAction}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">Review notes</p>
                      {result.output.safetyNotes.length ? (
                        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                          {result.output.safetyNotes.map((note) => <li key={note}>- {note}</li>)}
                        </ul>
                      ) : (
                        <p className="mt-1 text-sm text-muted-foreground">No additional notes supplied.</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {launchEnabled
                      ? "Submit a valid brief to generate a draft. No generated result is shown until the protected workflow succeeds."
                      : "New generation is paused. You can still prepare the complete brief above, and previously completed runs remain available in account history."}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl"><History className="h-5 w-5" />Recent runs</CardTitle>
                <CardDescription>Bounded history for the signed-in account only.</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingHistory ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading history</p>
                ) : historyError ? (
                  <div className="space-y-3">
                    <p role="alert" className="text-sm text-muted-foreground">{historyError}</p>
                    <Button asChild variant="outline" size="sm"><Link href="/login?next=/content-agent">Customer sign in</Link></Button>
                  </div>
                ) : runs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No content runs are stored for this account.</p>
                ) : (
                  <div className="divide-y">
                    {runs.map((run) => (
                      <article key={run.id} className="py-4 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{run.input.channel}</Badge>
                            <time className="text-xs text-muted-foreground" dateTime={run.createdAt}>{new Date(run.createdAt).toLocaleString()}</time>
                          </div>
                          <Badge variant={statusVariant(run.status)}>{statusLabels[run.status]}</Badge>
                        </div>
                        <h3 className="mt-2 break-words text-sm font-semibold">{run.output?.headline ?? run.input.businessName}</h3>
                        <p className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground">{run.input.goal}</p>
                        {run.errorCode ? <p className="mt-2 text-xs text-muted-foreground">Status: {run.errorCode}</p> : null}
                      </article>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </main>
  )
}
