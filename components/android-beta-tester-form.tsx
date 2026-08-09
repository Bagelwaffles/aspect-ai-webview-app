"use client"

import { FormEvent, useState } from "react"
import Link from "next/link"
import { CheckCircle2, ExternalLink, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type State = "idle" | "sending" | "sent" | "error"

export function AndroidBetaTesterForm({ closedTestUrl }: { closedTestUrl: string | null }) {
  const [state, setState] = useState<State>("idle")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [committed, setCommitted] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setState("sending")
    setError("")

    const form = event.currentTarget
    const formData = new FormData(form)
    const payload = {
      firstName: String(formData.get("firstName") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      androidDevice: String(formData.get("androidDevice") || "").trim(),
      commitment14Days: committed,
      source: String(formData.get("source") || "").trim(),
      notes: String(formData.get("notes") || "").trim(),
      website: String(formData.get("website") || "").trim(),
    }

    try {
      const response = await fetch("/api/android-beta/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || "Could not save tester signup")

      setMessage(data?.message || "You are on the AMS Android beta tester roster.")
      setState("sent")
      form.reset()
      setCommitted(false)
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Could not save tester signup")
      setState("error")
    }
  }

  if (state === "sent") {
    return (
      <div className="space-y-5 rounded-2xl border border-green-500/30 bg-green-500/10 p-6">
        <div className="flex gap-3">
          <CheckCircle2 className="mt-1 h-6 w-6 text-green-500" />
          <div>
            <h3 className="text-xl font-bold">You’re on the tester roster.</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{message}</p>
          </div>
        </div>

        {closedTestUrl ? (
          <div className="space-y-3 rounded-xl border border-border bg-background/70 p-4">
            <p className="font-semibold">The Google Play closed test is open.</p>
            <p className="text-sm text-muted-foreground">
              Use the same Google account email you entered above, opt in, install the app, and remain opted in for the full test period.
            </p>
            <Button asChild>
              <a href={closedTestUrl} target="_blank" rel="noreferrer">
                Open Google Play test <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-background/70 p-4 text-sm text-muted-foreground">
            The Play closed-test link is not public yet. Your email is saved to the AMS tester roster so it can be added when the test opens.
          </div>
        )}

        <Button asChild variant="outline">
          <Link href="/android-beta/feedback">Tester feedback form</Link>
        </Button>
      </div>
    )
  }

  return (
    <form className="grid gap-5" onSubmit={submit}>
      <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
        <div className="grid gap-2">
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" name="firstName" required maxLength={80} autoComplete="given-name" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">Google account email</Label>
          <Input id="email" name="email" type="email" required maxLength={180} autoComplete="email" />
          <p className="text-xs text-muted-foreground">Use the Google account you will use to join the Play test.</p>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="androidDevice">Android phone / tablet</Label>
        <Input id="androidDevice" name="androidDevice" required maxLength={120} placeholder="Example: Samsung Galaxy S23" />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="source">How did you hear about the test? <span className="text-muted-foreground">(optional)</span></Label>
        <Input id="source" name="source" maxLength={80} placeholder="Friend, tester community, social post, etc." />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="notes">Anything we should know? <span className="text-muted-foreground">(optional)</span></Label>
        <Textarea id="notes" name="notes" rows={3} maxLength={600} placeholder="Android version, accessibility needs, device quirks, etc." />
      </div>

      <div className="hidden" aria-hidden="true">
        <Label htmlFor="website">Website</Label>
        <Input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 text-sm leading-6">
        <input
          type="checkbox"
          checked={committed}
          onChange={(event) => setCommitted(event.target.checked)}
          className="mt-1 h-4 w-4 accent-primary"
        />
        <span>
          I can remain opted in to the AMS Google Play closed test for at least 14 consecutive days and will give honest private feedback. I understand this is free beta testing and I am not required to buy anything or leave a public review.
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!committed || state === "sending"}>
          {state === "sending" ? "Joining tester roster…" : "Join the free beta"}
        </Button>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4" />
          No payment. No public review required.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </form>
  )
}
