"use client"

import { FormEvent, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Copy, FileText, Loader2, Send } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  buildLeadMagnetContentBrief,
  type LeadMagnetTone,
  type LeadMagnetType,
} from "@/lib/lead-magnet-workflow"

type ContentRun = {
  id: string
  status: "queued" | "running" | "succeeded" | "failed" | "refunded" | "reconciliation"
  creditState: string
  output: {
    headline: string
    body: string
    callToAction: string
    safetyNotes: string[]
  } | null
}

type RunsResponse = {
  run?: ContentRun
  code?: string
  error?: string
}

function createRequestKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `lead-magnet-${crypto.randomUUID()}`
    : `lead-magnet-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`
}

function readableError(body: RunsResponse, fallback: string): string {
  return `${body.code ? `${body.code}: ` : ""}${body.error || fallback}`
}

function shouldKeepRequestKey(status: number, code: string | undefined): boolean {
  return status === 202 || status >= 500 || [
    "RATE_LIMIT_UNAVAILABLE",
    "CONTENT_RUN_STORE_UNAVAILABLE",
    "CREDIT_RESERVATION_FAILED",
    "CREDIT_REFUND_FAILED",
    "FINAL_PERSISTENCE_FAILED",
  ].includes(code ?? "")
}

export default function LeadMagnetAgentPage() {
  const [submitting, setSubmitting] = useState(false)
  const [requestKey, setRequestKey] = useState<string | null>(null)
  const [result, setResult] = useState<ContentRun | null>(null)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    const form = new FormData(event.currentTarget)
    const brief = buildLeadMagnetContentBrief({
      businessName: String(form.get("businessName") ?? ""),
      audience: String(form.get("audience") ?? ""),
      type: String(form.get("type") ?? "checklist") as LeadMagnetType,
      problem: String(form.get("problem") ?? ""),
      desiredOutcome: String(form.get("desiredOutcome") ?? ""),
      tone: String(form.get("tone") ?? "educational") as LeadMagnetTone,
      offer: String(form.get("offer") ?? ""),
    })

    const operationKey = requestKey ?? createRequestKey()
    setRequestKey(operationKey)
    setSubmitting(true)
    setError("")
    setResult(null)
    setCopied(false)

    try {
      const response = await fetch("/api/content-agent/runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": operationKey,
        },
        body: JSON.stringify(brief),
      })
      const body = (await response.json().catch(() => ({}))) as RunsResponse

      if (!response.ok || body.run?.status !== "succeeded" || !body.run.output) {
        setError(readableError(body, `Lead magnet generation failed (${response.status}).`))
        if (!shouldKeepRequestKey(response.status, body.code)) setRequestKey(null)
        return
      }

      setResult(body.run)
      setRequestKey(null)
    } catch {
      setError("NETWORK_ERROR: Retry to safely reuse the same generation request.")
    } finally {
      setSubmitting(false)
    }
  }

  async function copyDraft() {
    if (!result?.output || !navigator.clipboard) return
    const text = [result.output.headline, result.output.body, result.output.callToAction].join("\n\n")
    await navigator.clipboard.writeText(text)
    setCopied(true)
  }

  return (
    <main className="min-h-screen bg-background px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <Badge variant="secondary" className="w-fit">Beta · verified shared runtime</Badge>
            <div>
              <h1 className="text-2xl font-bold sm:text-3xl">Lead Magnet Agent</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                Turn a business problem and desired customer outcome into a useful lead-magnet draft. This workflow is draft-only: it does not publish, email, or contact anyone.
              </p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button asChild variant="outline" className="h-11 w-full sm:w-auto">
              <Link href="/agents/lead-magnet-agent"><ArrowLeft className="mr-2 h-4 w-4" />Agent status</Link>
            </Button>
            <Button asChild variant="outline" className="h-11 w-full sm:w-auto">
              <Link href="/content-agent">Content history</Link>
            </Button>
          </div>
        </header>

        <section className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Build the lead magnet</CardTitle>
              <CardDescription>
                Tap any field to type or paste. A successful generation uses one Content Agent credit and stays inside your AMS account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-5"
                onSubmit={submit}
                onChange={() => {
                  setRequestKey(null)
                  setError("")
                }}
                autoComplete="on"
              >
                <div className="space-y-2">
                  <Label htmlFor="lead-business">Business name</Label>
                  <Input
                    id="lead-business"
                    className="h-11 text-base"
                    name="businessName"
                    autoComplete="organization"
                    inputMode="text"
                    maxLength={120}
                    minLength={2}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lead-audience">Audience</Label>
                  <Textarea
                    id="lead-audience"
                    className="min-h-24 text-base"
                    name="audience"
                    placeholder="Example: local service-business owners who struggle to turn website visits into inquiries"
                    autoCapitalize="sentences"
                    spellCheck
                    maxLength={300}
                    minLength={3}
                    required
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="lead-type">Lead magnet type</Label>
                    <select
                      id="lead-type"
                      name="type"
                      defaultValue="checklist"
                      className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base"
                    >
                      <option value="checklist">Checklist</option>
                      <option value="quick-guide">Quick-start guide</option>
                      <option value="worksheet">Worksheet</option>
                      <option value="planner">Action planner</option>
                      <option value="email-course">Mini email-course guide</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lead-tone">Tone</Label>
                    <select
                      id="lead-tone"
                      name="tone"
                      defaultValue="educational"
                      className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base"
                    >
                      <option value="educational">Educational</option>
                      <option value="professional">Professional</option>
                      <option value="friendly">Friendly</option>
                      <option value="confident">Confident</option>
                      <option value="conversational">Conversational</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lead-problem">Problem to solve</Label>
                  <Textarea
                    id="lead-problem"
                    className="min-h-24 text-base"
                    name="problem"
                    placeholder="What specific problem should this free resource help the reader solve?"
                    autoCapitalize="sentences"
                    spellCheck
                    maxLength={160}
                    minLength={3}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lead-outcome">Desired reader outcome</Label>
                  <Textarea
                    id="lead-outcome"
                    className="min-h-24 text-base"
                    name="desiredOutcome"
                    placeholder="What should the reader understand, decide, or complete after using it?"
                    autoCapitalize="sentences"
                    spellCheck
                    maxLength={160}
                    minLength={3}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lead-offer">Related offer (optional)</Label>
                  <Textarea
                    id="lead-offer"
                    className="min-h-20 text-base"
                    name="offer"
                    placeholder="A real offer the draft may mention gently at the end."
                    autoCapitalize="sentences"
                    spellCheck
                    maxLength={300}
                  />
                </div>

                {error ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

                <Button className="h-11 w-full sm:w-auto" disabled={submitting} type="submit">
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  {submitting ? "Building lead magnet" : "Generate lead magnet"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl"><FileText className="h-5 w-5" />Lead magnet draft</CardTitle>
              <CardDescription>Generated output remains a draft until you review and choose to use it.</CardDescription>
            </CardHeader>
            <CardContent>
              {result?.output ? (
                <div className="space-y-5">
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">Title</p>
                    <h2 className="mt-1 break-words text-xl font-semibold">{result.output.headline}</h2>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">Draft</p>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{result.output.body}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">Call to action</p>
                    <p className="mt-1 break-words text-sm font-medium">{result.output.callToAction}</p>
                  </div>
                  {result.output.safetyNotes.length ? (
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">Review before using</p>
                      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                        {result.output.safetyNotes.map((note) => <li key={note}>- {note}</li>)}
                      </ul>
                    </div>
                  ) : null}
                  <Button type="button" variant="outline" className="h-11 w-full sm:w-auto" onClick={copyDraft}>
                    <Copy className="mr-2 h-4 w-4" />{copied ? "Copied" : "Copy draft"}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Complete the form to generate a lead magnet. Nothing is shown here until the protected Content Agent runtime succeeds and commits the run.
                </p>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}
