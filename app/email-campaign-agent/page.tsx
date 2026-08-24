"use client"

import { FormEvent, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Copy, Loader2, Mail, Send, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  buildEmailCampaignContentBrief,
  type EmailCampaignLength,
  type EmailCampaignTone,
  type EmailCampaignType,
} from "@/lib/email-campaign-workflow"

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
    ? `email-campaign-agent-${crypto.randomUUID()}`
    : `email-campaign-agent-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`
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

export default function EmailCampaignAgentPage() {
  const [submitting, setSubmitting] = useState(false)
  const [requestKey, setRequestKey] = useState<string | null>(null)
  const [result, setResult] = useState<ContentRun | null>(null)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    const form = new FormData(event.currentTarget)
    const brief = buildEmailCampaignContentBrief({
      businessName: String(form.get("businessName") ?? ""),
      audience: String(form.get("audience") ?? ""),
      campaignType: String(form.get("campaignType") ?? "promotion") as EmailCampaignType,
      sequenceLength: String(form.get("sequenceLength") ?? "3") as EmailCampaignLength,
      objective: String(form.get("objective") ?? ""),
      keyMessage: String(form.get("keyMessage") ?? ""),
      tone: String(form.get("tone") ?? "professional") as EmailCampaignTone,
      offer: String(form.get("offer") ?? ""),
      constraints: String(form.get("constraints") ?? ""),
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
        setError(readableError(body, `Email campaign generation failed (${response.status}).`))
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

  async function copyCampaign() {
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
            <Badge variant="secondary" className="w-fit">Live · production verified · human approval required</Badge>
            <div>
              <h1 className="text-2xl font-bold sm:text-3xl">Email Campaign Agent</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                Build a 3, 5, or 7-email campaign sequence for review. AMS does not send, schedule, enroll contacts, or collect addresses from this page.
              </p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button asChild variant="outline" className="h-11 w-full sm:w-auto">
              <Link href="/agents/email-campaign-agent"><ArrowLeft className="mr-2 h-4 w-4" />Agent status</Link>
            </Button>
            <Button asChild variant="outline" className="h-11 w-full sm:w-auto">
              <Link href="/content-agent">Content history</Link>
            </Button>
          </div>
        </header>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-muted-foreground">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p><strong className="text-foreground">Draft-only campaign boundary.</strong> Review every email before use. Only send to recipients you are permitted to contact, honor opt-outs, and follow applicable email and platform rules.</p>
          </div>
        </div>

        <section className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Build the campaign</CardTitle>
              <CardDescription>Required text fields stay editable on mobile. One successful generation uses one Content Agent credit.</CardDescription>
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
                  <Label htmlFor="email-campaign-business">Business name</Label>
                  <Input id="email-campaign-business" className="h-11 text-base" name="businessName" autoComplete="organization" inputMode="text" maxLength={120} minLength={2} required />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email-campaign-audience">Audience</Label>
                  <Textarea id="email-campaign-audience" className="min-h-24 text-base" name="audience" placeholder="Example: Kentucky small-business owners who opted in for marketing tips" autoCapitalize="sentences" spellCheck maxLength={500} minLength={3} required />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="email-campaign-type">Campaign type</Label>
                    <select id="email-campaign-type" name="campaignType" defaultValue="promotion" className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base">
                      <option value="promotion">Promotion</option>
                      <option value="launch">Launch</option>
                      <option value="announcement">Announcement</option>
                      <option value="educational">Educational</option>
                      <option value="event">Event</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email-campaign-length">Sequence length</Label>
                    <select id="email-campaign-length" name="sequenceLength" defaultValue="3" className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base">
                      <option value="3">3 emails</option>
                      <option value="5">5 emails</option>
                      <option value="7">7 emails</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email-campaign-objective">Campaign objective</Label>
                  <Textarea id="email-campaign-objective" className="min-h-20 text-base" name="objective" placeholder="Example: Introduce the $49 Quick Marketing Audit and earn qualified replies" autoCapitalize="sentences" spellCheck maxLength={240} minLength={3} required />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email-campaign-message">Key message</Label>
                  <Textarea id="email-campaign-message" className="min-h-24 text-base" name="keyMessage" placeholder="What should readers understand by the end of the sequence?" autoCapitalize="sentences" spellCheck maxLength={300} minLength={3} required />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="email-campaign-tone">Tone</Label>
                    <select id="email-campaign-tone" name="tone" defaultValue="professional" className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base">
                      <option value="professional">Professional</option>
                      <option value="friendly">Friendly</option>
                      <option value="confident">Confident</option>
                      <option value="educational">Educational</option>
                      <option value="conversational">Conversational</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email-campaign-offer">Offer (optional)</Label>
                    <Input id="email-campaign-offer" className="h-11 text-base" name="offer" placeholder="$49 Quick Marketing Audit" inputMode="text" maxLength={500} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email-campaign-constraints">Constraints or must-include details (optional)</Label>
                  <Textarea id="email-campaign-constraints" className="min-h-20 text-base" name="constraints" placeholder="Example: No discounts; keep each email concise." autoCapitalize="sentences" spellCheck maxLength={200} />
                </div>

                {error ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

                <Button className="h-11 w-full sm:w-auto" disabled={submitting} type="submit">
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  {submitting ? "Building email campaign" : "Generate email campaign"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl"><Mail className="h-5 w-5" />Human-reviewed campaign</CardTitle>
              <CardDescription>Nothing is sent or scheduled. Review the complete sequence for accuracy, claims, consent, and offer details before use.</CardDescription>
            </CardHeader>
            <CardContent>
              {result?.output ? (
                <div className="space-y-5">
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">Campaign direction</p>
                    <h2 className="mt-1 break-words text-xl font-semibold">{result.output.headline}</h2>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">Email sequence</p>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{result.output.body}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">Suggested campaign next step</p>
                    <p className="mt-1 break-words text-sm font-medium">{result.output.callToAction}</p>
                  </div>
                  {result.output.safetyNotes.length ? (
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">Verify before use</p>
                      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                        {result.output.safetyNotes.map((note) => <li key={note}>- {note}</li>)}
                      </ul>
                    </div>
                  ) : null}
                  <Button type="button" variant="outline" className="h-11 w-full sm:w-auto" onClick={copyCampaign}>
                    <Copy className="mr-2 h-4 w-4" />{copied ? "Copied" : "Copy campaign"}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Complete the form to generate one email sequence. Nothing appears here until the protected runtime succeeds and commits the run.</p>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}
