import { cookies } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"
import { CheckCircle2, ClipboardList, Mail, Smartphone, Users } from "lucide-react"

import { verifyInternalAdminCookie } from "@/app/lib/internal-admin-cookie"
import {
  AMS_RECRUITMENT_GOAL,
  GOOGLE_CLOSED_TEST_DAYS,
  GOOGLE_CLOSED_TEST_MINIMUM,
  listAndroidBetaFeedback,
  listAndroidBetaTesters,
} from "@/lib/server/android-beta-testers"

export const dynamic = "force-dynamic"

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  } catch {
    return value
  }
}

export default async function AndroidBetaDashboardPage() {
  const cookieStore = await cookies()
  const adminAccess = cookieStore.get("ams_internal_admin_access")?.value
  const expectedSecret = process.env.INTERNAL_ADMIN_SECRET?.trim()
  const adminSession = expectedSecret ? await verifyInternalAdminCookie(adminAccess, expectedSecret) : null

  if (!adminSession?.email) {
    redirect("/admin/login?next=/dashboard/android-beta")
  }

  const [testers, feedback] = await Promise.all([
    listAndroidBetaTesters(250),
    listAndroidBetaFeedback(100),
  ])

  const testUrl = process.env.AMS_ANDROID_CLOSED_TEST_URL?.trim() || null
  const committed = testers.filter((tester) => tester.commitment_14_days).length
  const emails = testers.map((tester) => tester.email).join("\n")

  return (
    <main className="min-h-screen bg-background px-5 py-10 sm:px-8 lg:py-14">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">AMS Command Center / Android</p>
            <h1 className="mt-2 text-4xl font-black tracking-tight">Google Play tester operations</h1>
            <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
              This is the AMS recruitment roster, not Google Play's authoritative eligibility count. Google Play Console remains the source of truth for who actually opted in and how many continuous test days qualify.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="rounded-lg border border-border px-4 py-2 font-semibold" href="/dashboard">← Command Center</Link>
            <Link className="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground" href="/android-beta">Public tester page ↗</Link>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl border border-border bg-card p-5">
            <Users className="h-6 w-6 text-primary" />
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Recruited leads</p>
            <strong className="mt-1 block text-4xl">{testers.length}</strong>
            <small className="text-muted-foreground">AMS goal: {AMS_RECRUITMENT_GOAL}</small>
          </article>
          <article className="rounded-2xl border border-border bg-card p-5">
            <CheckCircle2 className="h-6 w-6 text-primary" />
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">14-day commitment</p>
            <strong className="mt-1 block text-4xl">{committed}</strong>
            <small className="text-muted-foreground">Google minimum target: {GOOGLE_CLOSED_TEST_MINIMUM}</small>
          </article>
          <article className="rounded-2xl border border-border bg-card p-5">
            <ClipboardList className="h-6 w-6 text-primary" />
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Feedback records</p>
            <strong className="mt-1 block text-4xl">{feedback.length}</strong>
            <small className="text-muted-foreground">Private AMS feedback retained for launch review.</small>
          </article>
          <article className="rounded-2xl border border-border bg-card p-5">
            <Smartphone className="h-6 w-6 text-primary" />
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Closed-test link</p>
            <strong className="mt-1 block text-2xl">{testUrl ? "READY" : "NOT SET"}</strong>
            <small className="text-muted-foreground">Continuous target: {GOOGLE_CLOSED_TEST_DAYS} days.</small>
          </article>
        </section>

        {!testUrl ? (
          <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
            <h2 className="font-bold">Recruiting can start now. Play opt-in cannot.</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The roster is ready, but `AMS_ANDROID_CLOSED_TEST_URL` is not configured. Once Play Console gives us the official closed-test opt-in link, adding that environment variable will expose the real Google Play join button on the public tester page.
            </p>
          </section>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="border-b border-border p-5">
              <h2 className="text-xl font-bold">Tester roster</h2>
              <p className="mt-1 text-sm text-muted-foreground">Private owner view. Add these Google account emails to the Play closed-test tester list when the track is ready.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-left text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3">Tester</th>
                    <th className="px-5 py-3">Google email</th>
                    <th className="px-5 py-3">Device</th>
                    <th className="px-5 py-3">Source</th>
                    <th className="px-5 py-3">Feedback</th>
                    <th className="px-5 py-3">Joined roster</th>
                  </tr>
                </thead>
                <tbody>
                  {testers.length ? testers.map((tester) => (
                    <tr key={tester.id} className="border-t border-border align-top">
                      <td className="px-5 py-4 font-semibold">{tester.first_name}</td>
                      <td className="px-5 py-4"><a className="text-primary underline underline-offset-4" href={`mailto:${tester.email}`}>{tester.email}</a></td>
                      <td className="px-5 py-4 text-muted-foreground">{tester.android_device}</td>
                      <td className="px-5 py-4 text-muted-foreground">{tester.source ?? "—"}</td>
                      <td className="px-5 py-4">{tester.feedback_count}</td>
                      <td className="px-5 py-4 text-muted-foreground">{formatDate(tester.created_at)}</td>
                    </tr>
                  )) : (
                    <tr><td className="px-5 py-8 text-muted-foreground" colSpan={6}>No tester signups yet. The recruitment page is ready to start collecting them.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-6">
            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-2"><Mail className="h-5 w-5 text-primary" /><h2 className="text-xl font-bold">Play tester email list</h2></div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Copy these into the Play closed-test tester list. Empty until people join.</p>
              <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-background p-4 text-xs">{emails || "No tester emails yet."}</pre>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-xl font-bold">Launch rule</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Do not treat `12` recruited leads as success. The production gate is met only when Play Console itself shows at least {GOOGLE_CLOSED_TEST_MINIMUM} qualifying testers continuously opted in for {GOOGLE_CLOSED_TEST_DAYS} days and the production-access application is accepted.
              </p>
            </section>
          </div>
        </section>
      </div>
    </main>
  )
}
