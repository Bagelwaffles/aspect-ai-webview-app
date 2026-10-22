import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { ShieldCheck, LockKeyhole, CreditCard } from "lucide-react"

import { verifyInternalAdminCookie } from "@/app/lib/internal-admin-cookie"
import { inspectAuditOwnerPilotConfiguration } from "@/lib/server/quick-audit-owner-readiness"
import { QuickAuditOwnerPilotForm } from "./QuickAuditOwnerPilotForm"
import { QuickAuditOwnerDryRun } from "./QuickAuditOwnerDryRun"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "AMS Audit Owner Pilot | Preview only",
  robots: { index: false, follow: false },
}

export default async function OwnerAuditPilotPage() {
  const cookieStore = await cookies()
  const cookie = cookieStore.get("ams_internal_admin_access")?.value
  const adminSecret = process.env.INTERNAL_ADMIN_SECRET?.trim()
  const admin = adminSecret && cookie ? await verifyInternalAdminCookie(cookie, adminSecret) : null
  if (!admin?.email) redirect("/admin/login?next=/dashboard/quick-audit-pilot")

  const owner = process.env.AMS_QUICK_AUDIT_OWNER_PILOT_EMAIL?.trim().toLowerCase()
  if (!owner || admin.email.trim().toLowerCase() !== owner) {
    return <main className="mx-auto max-w-xl px-4 py-12"><h1 className="text-2xl font-bold">Not authorized</h1><p>This preview is for the authorized AMS owner only.</p></main>
  }
  const gates = inspectAuditOwnerPilotConfiguration(process.env)
  const enabled = gates.every(gate => gate.configured)
  const dryRunEnabled = process.env.VERCEL_ENV === "preview" &&
    process.env.AMS_QUICK_AUDIT_OWNER_DRY_RUN_ENABLED === "true"

  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-primary">
          <ShieldCheck className="h-5 w-5" /> Internal AMS owner acceptance test
        </div>
        <h1 className="text-3xl font-bold">Audit Aspect Marketing Solutions</h1>
        <p className="text-muted-foreground">Run the same five-findings audit on the AMS website using the existing Quick Audit test-mode product and fulfillment pipeline. This pilot is not a public sale.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-xl border p-4">
            <CreditCard className="mt-1 h-5 w-5 text-primary" />
            <div><p className="font-semibold">$5 simulated checkout</p><p className="text-sm text-muted-foreground">Discounted from the existing $49 TEST price. No real funds move.</p></div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border p-4">
            <LockKeyhole className="mt-1 h-5 w-5 text-primary" />
            <div><p className="font-semibold">Preview only</p><p className="text-sm text-muted-foreground">Requires owner session, preview flag, test keys and ready fulfillment.</p></div>
          </div>
        </div>
        <section className="rounded-2xl border p-5 sm:p-6" aria-labelledby="pilot-gates-heading">
          <h2 id="pilot-gates-heading" className="text-lg font-semibold">Private test readiness</h2>
          <p className="mt-1 text-sm text-muted-foreground">Configuration checks only. A real test session, Stripe webhook delivery and independent storage isolation still require verification.</p>
          <ul className="mt-4 space-y-3">
            {gates.map(gate => (
              <li className="flex items-start gap-3" key={gate.id}>
                <span aria-label={gate.configured ? "Configured" : "Not configured"} className={`mt-0.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${gate.configured ? "border-green-600/30 text-green-700 dark:text-green-300" : "border-amber-600/30 text-amber-700 dark:text-amber-300"}`}>
                  {gate.configured ? "Set" : "Blocked"}
                </span>
                <div>
                  <p className="text-sm font-semibold">{gate.label}</p>
                  <p className="text-xs text-muted-foreground">{gate.explanation}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
        {dryRunEnabled ? (
          <QuickAuditOwnerDryRun />
        ) : (
          <p className="rounded-lg border px-4 py-3 text-sm text-muted-foreground">
            The no-charge AMS self-audit is disabled on this Preview until owner access and its dry-run gate are explicitly configured.
          </p>
        )}
        {enabled ? (
          <QuickAuditOwnerPilotForm />
        ) : (
          <section className="rounded-xl border p-5" aria-live="polite">
            <h2 className="font-semibold">Pilot checkout is disabled</h2>
            <p className="mt-2 text-sm text-muted-foreground">That is the safe default. Complete CI, verified webhook routing, preview result storage, delivery and security tests first. Enable the owner pilot only after those checks are approved.</p>
          </section>
        )}
        <p className="text-sm text-muted-foreground">Test acceptance requires exactly one completed Checkout Session, one signed webhook fulfillment, one stored audit result, correct report rendering, and a safe duplicate replay. Manual review of the findings is required before claiming autonomous professional quality.</p>
      </div>
    </main>
  )
}
