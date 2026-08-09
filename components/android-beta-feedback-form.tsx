"use client"

import { FormEvent, useState } from "react"
import Link from "next/link"
import { CheckCircle2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type State = "idle" | "sending" | "sent" | "error"

export function AndroidBetaFeedbackForm() {
  const [state, setState] = useState<State>("idle")
  const [error, setError] = useState("")
  const [consent, setConsent] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setState("sending")
    setError("")

    const form = event.currentTarget
    const formData = new FormData(form)
    const payload = {
      email: String(formData.get("email") || "").trim(),
      rating: Number(formData.get("rating") || 0),
      device: String(formData.get("device") || "").trim(),
      whatWorked: String(formData.get("whatWorked") || "").trim(),
      issue: String(formData.get("issue") || "").trim(),
      suggestion: String(formData.get("suggestion") || "").trim(),
      consent,
      website: String(formData.get("website") || "").trim(),
    }

    try {
      const response = await fetch("/api/android-beta/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        if (data?.error === "tester_not_found") {
          throw new Error("That email is not on the AMS tester roster yet. Join the beta first.")
        }
        throw new Error(data?.error || "Could not save feedback")
      }

      form.reset()
      setConsent(false)
      setState("sent")
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Could not save feedback")
      setState("error")
    }
  }

  if (state === "sent") {
    return (
      <div className="space-y-4 rounded-2xl border border-green-500/30 bg-green-500/10 p-6">
        <div className="flex gap-3">
          <CheckCircle2 className="mt-1 h-6 w-6 text-green-500" />
          <div>
            <h2 className="text-xl font-bold">Feedback saved.</h2>
            <p className="mt-1 text-sm text-muted-foreground">Thank you. This is the kind of real testing evidence AMS needs before production release.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => setState("idle")}>Send more feedback</Button>
          <Button asChild variant="outline"><Link href="/android-beta">Back to beta page</Link></Button>
        </div>
      </div>
    )
  }

  return (
    <form className="grid gap-5" onSubmit={submit}>
      <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
        <div className="grid gap-2">
          <Label htmlFor="email">Tester Google account email</Label>
          <Input id="email" name="email" type="email" required maxLength={180} autoComplete="email" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="rating">Overall beta experience</Label>
          <select id="rating" name="rating" required defaultValue="" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="" disabled>Select 1–5</option>
            <option value="5">5 — worked very well</option>
            <option value="4">4 — mostly good</option>
            <option value="3">3 — usable but needs work</option>
            <option value="2">2 — significant problems</option>
            <option value="1">1 — could not use it</option>
          </select>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="device">Device <span className="text-muted-foreground">(optional)</span></Label>
        <Input id="device" name="device" maxLength={120} placeholder="Example: Pixel 8, Android 16" />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="whatWorked">What worked well?</Label>
        <Textarea id="whatWorked" name="whatWorked" rows={4} required maxLength={1000} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="issue">What broke or confused you? <span className="text-muted-foreground">(optional)</span></Label>
        <Textarea id="issue" name="issue" rows={4} maxLength={1500} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="suggestion">What should we change? <span className="text-muted-foreground">(optional)</span></Label>
        <Textarea id="suggestion" name="suggestion" rows={4} maxLength={1500} />
      </div>

      <div className="hidden" aria-hidden="true">
        <Label htmlFor="website">Website</Label>
        <Input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 text-sm leading-6">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 h-4 w-4 accent-primary" />
        <span>I agree that AMS may store this private beta feedback and use it to improve the Android app and describe testing outcomes to Google Play.</span>
      </label>

      <Button type="submit" disabled={!consent || state === "sending"}>
        {state === "sending" ? "Saving feedback…" : "Send private feedback"}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </form>
  )
}
