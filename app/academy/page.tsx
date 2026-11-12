import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"
import { notFound, redirect } from "next/navigation"

import { AmsPublicFooter } from "@/components/ams-public-footer"
import { AmsPublicHeader } from "@/components/ams-public-header"
import {
  academyCourse,
  academyLessons,
  isAcademyLessonId,
  type AcademyLessonId,
} from "@/lib/academy/catalog"
import { authOptions, isCustomerAuthConfigured } from "@/lib/auth"
import { isAcademyPreviewEnabled } from "@/lib/academy/preview-gate"
import { customerPrincipalFromSession } from "@/lib/server/customer-api-auth"
import {
  getAcademyCompletedLessons,
  markAcademyLessonComplete,
} from "@/lib/server/academy-progress"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
  title: "AMS Academy | Controlled Pilot",
  robots: { index: false, follow: false },
}

async function completeAcademyLesson(formData: FormData) {
  "use server"

  if (!isAcademyPreviewEnabled()) notFound()
  const session = isCustomerAuthConfigured()
    ? await getServerSession(authOptions).catch(() => null)
    : null
  const customer = customerPrincipalFromSession(session)
  if (!customer) redirect("/login?next=%2Facademy")

  const lessonId = formData.get("lessonId")
  if (!isAcademyLessonId(lessonId)) throw new Error("ACADEMY_INVALID_LESSON")

  // Server-derived subject; the browser cannot submit another customer's ID.
  await markAcademyLessonComplete(customer.subject, lessonId)
  revalidatePath("/academy")
}

export default async function AcademyPage() {
  if (!isAcademyPreviewEnabled()) notFound()

  const session = isCustomerAuthConfigured()
    ? await getServerSession(authOptions).catch(() => null)
    : null
  const customer = customerPrincipalFromSession(session)
  if (!customer) redirect("/login?next=%2Facademy")

  let completed: AcademyLessonId[] = []
  let progressAvailable = true
  try {
    completed = await getAcademyCompletedLessons(customer.subject)
  } catch {
    progressAvailable = false
  }

  const completedIds = new Set<AcademyLessonId>(completed)
  const progressPercent = Math.round((completed.length / academyLessons.length) * 100)

  return (
    <>
      <AmsPublicHeader />
      <main className="min-h-screen bg-background px-5 py-12 text-foreground">
        <div className="mx-auto max-w-5xl">
          <header className="rounded-2xl border border-border bg-card p-6 md:p-9">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              AMS Academy · Preview only
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-5xl">{academyCourse.title}</h1>
            <p className="mt-3 max-w-2xl text-muted-foreground">{academyCourse.description}</p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <div className="rounded-lg bg-muted px-4 py-3">
                <span className="text-2xl font-bold">{completed.length}</span>
                <span className="text-sm text-muted-foreground"> / {academyLessons.length} lessons self-marked complete</span>
              </div>
              <div className="min-w-44 flex-1" aria-label={`Progress ${progressPercent}%`}>
                <div className="h-3 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${progressPercent}%` }} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{progressPercent}% of pilot learning path</p>
              </div>
            </div>
          </header>

          {!progressAvailable ? (
            <p className="mt-6 rounded-lg border border-destructive/60 bg-destructive/10 p-4" role="status">
              Progress storage is unavailable. Completion controls are disabled, and no progress has been assumed or saved.
            </p>
          ) : null}

          <section className="mt-10 space-y-5" aria-label="Course lessons">
            <div>
              <h2 className="text-2xl font-bold">Your six practical lessons</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Study the material, complete the exercise yourself, then mark the lesson complete.
                Completion is self-reported; it is not a certificate or proof of mastery.
              </p>
            </div>
            {academyLessons.map((lesson) => {
              const isComplete = completedIds.has(lesson.id)
              return (
                <article key={lesson.id} className="rounded-xl border border-border bg-card p-5 md:p-7">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                        Lesson {lesson.number}
                      </p>
                      <h3 className="mt-2 text-xl font-semibold">{lesson.title}</h3>
                      <p className="mt-2 text-sm text-muted-foreground">{lesson.outcome}</p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${isComplete
                      ? "border-emerald-500/50 text-emerald-500"
                      : "border-border text-muted-foreground"}`}>
                      {isComplete ? "Completed" : "Not completed"}
                    </span>
                  </div>
                  <details className="mt-5 rounded-lg border border-border p-4">
                    <summary className="cursor-pointer font-semibold">Open lesson and exercise</summary>
                    <ol className="ml-5 mt-4 list-decimal space-y-2 text-sm leading-6 text-muted-foreground">
                      {lesson.guidance.map((step) => <li key={step}>{step}</li>)}
                    </ol>
                    <div className="mt-4 rounded-lg bg-muted p-4">
                      <p className="text-xs font-bold uppercase tracking-widest text-primary">Your assignment</p>
                      <p className="mt-2 text-sm leading-6">{lesson.assignment}</p>
                    </div>
                    <form action={completeAcademyLesson} className="mt-4">
                      <input type="hidden" name="lessonId" value={lesson.id} />
                      <button
                        type="submit"
                        disabled={isComplete || !progressAvailable}
                        className="rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isComplete ? "Already recorded" : "I completed this lesson"}
                      </button>
                    </form>
                  </details>
                </article>
              )
            })}
          </section>
          <p className="mt-8 text-sm text-muted-foreground">
            Pilot only: no payments, public enrollment, external AI calls, or automated credentials.
            Student progress is stored under your signed-in AMS account, not in your browser alone.
          </p>
        </div>
      </main>
      <AmsPublicFooter />
    </>
  )
}
