import Link from "next/link"
import { CheckCircle2, Smartphone, Users, ShieldCheck } from "lucide-react"

import { AndroidBetaTesterForm } from "@/components/android-beta-tester-form"
import {
  AMS_RECRUITMENT_GOAL,
  GOOGLE_CLOSED_TEST_DAYS,
  GOOGLE_CLOSED_TEST_MINIMUM,
} from "@/lib/server/android-beta-testers"

export const metadata = {
  title: "AMS Android Beta Testers | Aspect Marketing Solutions",
  description: "Join the free Google Play closed test for the Aspect Marketing Solutions Android app.",
}

export const dynamic = "force-dynamic"

const missions = [
  "Install the Play-delivered beta and open it on your Android device.",
  "Refresh the live AMS platform-health status and tell us whether the result is clear.",
  "Review the Agent Network lifecycle labels and tell us what is confusing.",
  "Open the privacy and support actions and confirm they behave normally on your phone.",
  "Use the app more than once during the test and send at least one piece of honest private feedback.",
]

export default function AndroidBetaPage() {
  const closedTestUrl = process.env.AMS_ANDROID_CLOSED_TEST_URL?.trim() || null

  return (
    <main className="min-h-screen bg-background px-5 py-10 sm:px-8 lg:py-16">
      <div className="mx-auto max-w-6xl space-y-12">
        <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Smartphone className="h-4 w-4" /> Google Play closed beta
            </div>
            <h1 className="text-4xl font-black tracking-tight sm:text-6xl">
              Help us get AMS onto Google Play.
            </h1>
            <p className="max-w-3xl text-lg leading-8 text-muted-foreground">
              We are recruiting real Android users to test the Aspect Marketing Solutions app before production release. This is not a sales pitch: testing is free, there is no purchase requirement, and we want private feedback—not fake five-star reviews.
            </p>
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="rounded-lg border border-border bg-card px-3 py-2">
                Minimum Google target: <strong>{GOOGLE_CLOSED_TEST_MINIMUM} testers</strong>
              </span>
              <span className="rounded-lg border border-border bg-card px-3 py-2">
                Continuous opt-in window: <strong>{GOOGLE_CLOSED_TEST_DAYS} days</strong>
              </span>
              <span className="rounded-lg border border-border bg-card px-3 py-2">
                AMS recruiting goal: <strong>{AMS_RECRUITMENT_GOAL}</strong>
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Google currently applies the 12-tester / 14-day production-access rule to personal Play developer accounts created after November 13, 2023. We recruit above the minimum so one dropout does not reset the launch plan. See the official Google guidance in the testing instructions below.
            </p>
          </div>

          <div className="rounded-3xl border border-border bg-card p-6 shadow-xl sm:p-8">
            <div className="mb-6 space-y-2">
              <p className="text-sm font-semibold uppercase tracking-[0.15em] text-primary">Tester signup</p>
              <h2 className="text-2xl font-bold">Reserve a beta seat</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Use the Google account email you will use in Google Play. We keep the roster private and use it only to coordinate the AMS Android test.
              </p>
            </div>
            <AndroidBetaTesterForm closedTestUrl={closedTestUrl} />
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-3">
          <article className="rounded-2xl border border-border bg-card p-6">
            <Users className="h-7 w-7 text-primary" />
            <h2 className="mt-4 text-xl font-bold">You are a tester, not a customer.</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              You do not need to buy AMS, subscribe, or leave a public review. The goal is to find confusing behavior and real device issues before launch.
            </p>
          </article>
          <article className="rounded-2xl border border-border bg-card p-6">
            <ShieldCheck className="h-7 w-7 text-primary" />
            <h2 className="mt-4 text-xl font-bold">Stay opted in.</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Google requires qualifying testers to remain opted in continuously for the full test window. Leaving and rejoining can stop that tester from satisfying the requirement.
            </p>
          </article>
          <article className="rounded-2xl border border-border bg-card p-6">
            <CheckCircle2 className="h-7 w-7 text-primary" />
            <h2 className="mt-4 text-xl font-bold">Give useful private feedback.</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Tell us what worked, what failed, and what you would change. That gives AMS evidence for the production-access review instead of meaningless install counts.
            </p>
          </article>
        </section>

        <section className="grid gap-8 rounded-3xl border border-border bg-card p-6 sm:p-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.15em] text-primary">Tester mission</p>
            <h2 className="mt-2 text-3xl font-bold">Five simple things to test</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              You do not need technical experience. We deliberately made the test instructions concrete so useful feedback does not depend on knowing software development.
            </p>
          </div>
          <ol className="space-y-3">
            {missions.map((mission, index) => (
              <li key={mission} className="flex gap-4 rounded-xl border border-border bg-background/60 p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">
                  {index + 1}
                </span>
                <span className="pt-1 text-sm leading-6">{mission}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-3xl border border-primary/30 bg-primary/5 p-6 sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.15em] text-primary">During the test</p>
          <h2 className="mt-2 text-3xl font-bold">Send feedback directly to AMS.</h2>
          <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
            Use our private tester feedback form whenever you find something useful. Google Play also supports private tester feedback. We do not ask testers to manufacture ratings or public reviews.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link className="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground" href="/android-beta/feedback">
              Open tester feedback
            </Link>
            <a
              className="rounded-lg border border-border px-4 py-2 font-semibold"
              href="https://support.google.com/googleplay/android-developer/answer/14151465"
              target="_blank"
              rel="noreferrer"
            >
              Google testing requirements ↗
            </a>
          </div>
        </section>
      </div>
    </main>
  )
}
