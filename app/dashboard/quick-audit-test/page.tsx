import Link from "next/link"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { verifyInternalAdminCookie } from "@/app/lib/internal-admin-cookie"

import QuickAuditTestClient from "./QuickAuditTestClient"

export const dynamic = "force-dynamic"

export default async function QuickAuditTestPage() {
  const cookieStore = await cookies()
  const adminAccess = cookieStore.get("ams_internal_admin_access")?.value
  const expectedSecret = process.env.INTERNAL_ADMIN_SECRET?.trim()
  const adminSession = expectedSecret
    ? await verifyInternalAdminCookie(adminAccess, expectedSecret)
    : null

  if (!adminSession?.email) {
    redirect("/admin/login?next=/dashboard/quick-audit-test")
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-4">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">
            AMS // Owner Test Lane
          </p>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
            Quick Audit test-mode E2E.
          </h1>
          <p className="max-w-2xl text-base leading-7 text-slate-300">
            This lane creates a real Stripe Checkout Session using AMS test-mode configuration and fixed fake business data. It cannot use a live Stripe key and it does not enable public sales.
          </p>
        </header>

        <section className="rounded-2xl border border-emerald-400/20 bg-slate-900/70 p-6 shadow-2xl shadow-black/30">
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-4">
              <p className="font-bold text-amber-200">Test mode only</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Use Stripe test payment information only. Do not enter a real card. No real charge should be created by this lane.
              </p>
            </div>

            <QuickAuditTestClient />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
          <h2 className="text-xl font-bold">What this proves</h2>
          <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
            <li><strong className="text-slate-100">1.</strong> AMS can create the approved $49 Checkout Session using Stripe test mode.</li>
            <li><strong className="text-slate-100">2.</strong> Stripe completes a fake-money payment and sends the signed test webhook to AMS.</li>
            <li><strong className="text-slate-100">3.</strong> AMS generates and stores the native audit without n8n.</li>
            <li><strong className="text-slate-100">4.</strong> The success page independently verifies the paid test session before showing the durable result.</li>
            <li><strong className="text-slate-100">5.</strong> We can replay/refresh the result path without another charge or duplicate fulfillment.</li>
          </ol>
        </section>

        <div className="flex flex-wrap gap-3 text-sm">
          <Link className="rounded-lg border border-slate-700 px-4 py-2 hover:bg-slate-900" href="/quick-marketing-audit">
            View paused public offer
          </Link>
          <Link className="rounded-lg border border-slate-700 px-4 py-2 hover:bg-slate-900" href="/dashboard">
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  )
}
