import Link from "next/link"

import { AndroidBetaFeedbackForm } from "@/components/android-beta-feedback-form"

export const metadata = {
  title: "AMS Android Beta Feedback | Aspect Marketing Solutions",
  description: "Private feedback form for Aspect Marketing Solutions Android beta testers.",
}

export default function AndroidBetaFeedbackPage() {
  return (
    <main className="min-h-screen bg-background px-5 py-10 sm:px-8 lg:py-16">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-[0.15em] text-primary">AMS Android closed beta</p>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">Tell us what actually happened.</h1>
          <p className="text-lg leading-8 text-muted-foreground">
            Private feedback is more valuable than compliments. Tell us what worked, what confused you, and anything that broke on your Android device.
          </p>
          <Link className="text-sm font-semibold text-primary underline underline-offset-4" href="/android-beta">
            ← Back to tester instructions
          </Link>
        </header>

        <section className="rounded-3xl border border-border bg-card p-6 shadow-xl sm:p-8">
          <AndroidBetaFeedbackForm />
        </section>
      </div>
    </main>
  )
}
