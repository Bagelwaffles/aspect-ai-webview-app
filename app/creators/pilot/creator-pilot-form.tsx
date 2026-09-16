"use client"

import { FormEvent, useState } from "react"

import { Button } from "@/components/ui/button"

const platforms = [
  ["twitch", "Twitch"],
  ["youtube", "YouTube"],
  ["tiktok", "TikTok"],
  ["kick", "Kick"],
  ["facebook", "Facebook Gaming"],
  ["other", "Other"],
] as const

const categories = [
  "Shooters",
  "RPGs",
  "Survival",
  "Simulation",
  "Sports / Racing",
  "Variety",
  "Co-op",
  "Competitive / Esports",
] as const

type ApiResponse = {
  ok?: boolean
  saved?: boolean
  existing?: boolean
  applicationId?: string | null
  message?: string
  error?: string
}

const fieldClass =
  "mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"

export function CreatorPilotForm() {
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setMessage(null)
    setError(null)

    const form = event.currentTarget
    const formData = new FormData(form)
    const weeklyHoursRaw = String(formData.get("weeklyStreamHours") ?? "").trim()
    const weeklyHours = weeklyHoursRaw ? Number.parseInt(weeklyHoursRaw, 10) : null

    const payload = {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      creatorHandle: String(formData.get("creatorHandle") ?? ""),
      primaryPlatform: String(formData.get("primaryPlatform") ?? ""),
      platforms: formData.getAll("platforms").map(String),
      primaryGame: String(formData.get("primaryGame") ?? ""),
      creatorCategories: formData.getAll("creatorCategories").map(String),
      goals: String(formData.get("goals") ?? ""),
      biggestBottleneck: String(formData.get("biggestBottleneck") ?? ""),
      currentSetup: String(formData.get("currentSetup") ?? ""),
      weeklyStreamHours: Number.isFinite(weeklyHours) ? weeklyHours : null,
      consentContact: formData.get("consentContact") === "yes",
      source: "ams-creators-pilot-page",
      website: String(formData.get("website") ?? ""),
    }

    try {
      const response = await fetch("/api/creators/pilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const body = (await response.json().catch(() => ({}))) as ApiResponse

      if (!response.ok || !body.ok) {
        if (response.status === 429) {
          setError("Too many pilot requests were submitted from this connection. Please try again later.")
        } else if (response.status === 503) {
          setError("The creator pilot intake is temporarily unavailable. No application was lost or silently accepted.")
        } else {
          setError("Please check the required fields and try again.")
        }
        return
      }

      setMessage(body.message ?? "Your AMS Creator Pilot application was received.")
      if (!body.existing) form.reset()
    } catch {
      setError("The request could not be submitted. Please try again when your connection is stable.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="space-y-8" onSubmit={submit}>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Your name
          <input className={fieldClass} name="name" autoComplete="name" maxLength={100} required />
        </label>
        <label className="text-sm font-medium">
          Email
          <input className={fieldClass} name="email" type="email" autoComplete="email" maxLength={180} required />
        </label>
        <label className="text-sm font-medium">
          Creator / channel handle
          <input className={fieldClass} name="creatorHandle" maxLength={80} placeholder="@yourhandle" required />
        </label>
        <label className="text-sm font-medium">
          Primary platform
          <select className={fieldClass} name="primaryPlatform" defaultValue="" required>
            <option value="" disabled>Select one</option>
            {platforms.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Primary game or content focus
          <input className={fieldClass} name="primaryGame" maxLength={120} placeholder="Once Human, Call of Duty, variety, etc." />
        </label>
        <label className="text-sm font-medium">
          Approx. streaming hours per week
          <input className={fieldClass} name="weeklyStreamHours" type="number" min={0} max={100} inputMode="numeric" />
        </label>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Platforms you actively use</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {platforms.map(([value, label]) => (
            <label className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm" key={value}>
              <input type="checkbox" name="platforms" value={value} className="h-4 w-4 accent-primary" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Gaming / creator categories</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((category) => (
            <label className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm" key={category}>
              <input type="checkbox" name="creatorCategories" value={category} className="h-4 w-4 accent-primary" />
              {category}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-5 lg:grid-cols-2">
        <label className="text-sm font-medium">
          What do you want the platform to help you accomplish?
          <textarea
            className={`${fieldClass} min-h-36 resize-y`}
            name="goals"
            minLength={10}
            maxLength={1200}
            placeholder="Grow repeat viewers, find better clips, plan streams, improve Shorts, build a consistent schedule..."
            required
          />
        </label>
        <label className="text-sm font-medium">
          What is your biggest bottleneck right now?
          <textarea
            className={`${fieldClass} min-h-36 resize-y`}
            name="biggestBottleneck"
            minLength={10}
            maxLength={1200}
            placeholder="Editing time, knowing what to post, analytics, titles, equipment, collaboration, consistency..."
            required
          />
        </label>
      </div>

      <label className="block text-sm font-medium">
        Current setup (optional)
        <textarea
          className={`${fieldClass} min-h-28 resize-y`}
          name="currentSetup"
          maxLength={1000}
          placeholder="Console/PC, OBS or direct console streaming, microphone, capture card, editing tools, etc."
        />
      </label>

      <div className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label>
          Website
          <input name="website" type="text" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
        <input className="mt-1 h-4 w-4 shrink-0 accent-primary" type="checkbox" name="consentContact" value="yes" required />
        <span>
          I want to be considered for the controlled AMS Creator Pilot and agree that AMS may contact me about this pilot. This does not enroll me in a paid subscription or authorize automatic posting to my accounts.
        </span>
      </label>

      {message ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200" role="status">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <Button size="lg" type="submit" disabled={submitting}>
          {submitting ? "Submitting…" : "Apply for the Creator Pilot"}
        </Button>
        <p className="max-w-xl text-xs leading-5 text-muted-foreground">
          Pilot applications are retained for up to 180 days for review and follow-up. The pilot does not grant AMS permission to publish, message, spend money, or change external accounts automatically.
        </p>
      </div>
    </form>
  )
}
