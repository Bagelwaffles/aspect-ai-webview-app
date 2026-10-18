import Link from "next/link"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { verifyInternalAdminCookie } from "@/app/lib/internal-admin-cookie"
import { listMaintenanceFindings } from "@/lib/server/maintenance-lifecycle"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default async function MaintenanceDashboard() {
  const cookieStore = await cookies()
  const adminCookie = cookieStore.get("ams_internal_admin_access")?.value
  const secret = process.env.INTERNAL_ADMIN_SECRET?.trim()
  const admin = secret ? await verifyInternalAdminCookie(adminCookie, secret) : null
  if (!admin?.email) redirect("/admin/login?next=/dashboard/maintenance")

  let failed = false
  const findings = await listMaintenanceFindings(100).catch(() => {
    failed = true
    return []
  })
  const enabled = process.env.AMS_MAINTENANCE_ENABLED === "true"

  return (
    <main className="mx-auto min-h-screen max-w-6xl space-y-6 bg-background px-4 py-10 text-foreground">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">AMS operations</p>
          <h1 className="text-3xl font-bold">Update &amp; Repair queue</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Verified observations, source links and independent GitHub PR/CI evidence.
            An observed warning is not a repaired incident; a passing PR is not a deployment.
          </p>
        </div>
        <Link href="/dashboard" className="rounded-lg border px-4 py-2 text-sm">Back to dashboard</Link>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">Native cron ingestion</p>
          <p className="mt-2 text-xl font-semibold">{enabled ? "Enabled" : "Disabled"}</p>
          <p className="mt-1 text-xs text-muted-foreground">Does not generate or release code</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">Indexed findings</p>
          <p className="mt-2 text-xl font-semibold">{failed ? "Unavailable" : findings.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">Preview and Production Redis are separate</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">Production executor</p>
          <p className="mt-2 text-xl font-semibold">Off</p>
          <p className="mt-1 text-xs text-muted-foreground">Merges, billing and publishing remain gated</p>
        </div>
      </section>

      {failed ? (
        <p role="alert" className="rounded-xl border p-4 text-sm">
          Maintenance evidence store cannot be read. No in-memory results were substituted.
          Confirm the correct environment&apos;s Redis configuration.
        </p>
      ) : findings.length === 0 ? (
        <p className="rounded-xl border p-6 text-sm text-muted-foreground">
          No persistent findings are indexed in this environment. This is not proof that production
          has no incidents. Check the monitor cron and the ingestion switch.
        </p>
      ) : (
        <section className="space-y-3" aria-label="Maintenance findings">
          {findings.map((finding) => (
            <article key={finding.id} className="space-y-3 rounded-xl border p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <h2 className="font-semibold">{finding.summary}</h2>
                <span className="text-sm font-medium">{finding.state.replace(/_/gu, " ")}</span>
              </div>
              <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                <div><dt>Area</dt><dd className="font-medium text-foreground">{finding.area}</dd></div>
                <div><dt>Origin</dt><dd className="font-medium text-foreground">{finding.origin}</dd></div>
                <div><dt>Confidence</dt><dd className="font-medium text-foreground">{finding.confidence}</dd></div>
                <div><dt>Policy</dt><dd className="font-medium text-foreground">{finding.policy.replace(/_/gu, " ")}</dd></div>
                <div><dt>Severity</dt><dd>{finding.severity}</dd></div>
                <div><dt>Cost estimate</dt><dd>{finding.estimatedCostUsd === null ? "Unknown" : "$" + finding.estimatedCostUsd.toFixed(2)}</dd></div>
                <div><dt>Observed</dt><dd>{finding.sourceObservedAt}</dd></div>
                <div><dt>Last updated</dt><dd>{finding.updatedAt}</dd></div>
              </dl>
              <div className="flex flex-wrap gap-4 text-sm underline">
                {finding.evidenceUrl ? <a href={finding.evidenceUrl} target="_blank" rel="noreferrer">Source evidence</a> : null}
                {finding.pr ? <a href={finding.pr.url} target="_blank" rel="noreferrer">GitHub draft PR</a> : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {finding.pr?.ciVerifiedAt
                  ? "Required checks verified at " + finding.pr.ciVerifiedAt + ". Release NOT authorized."
                  : "No verified deployment or resolution proof."}
              </p>
            </article>
          ))}
        </section>
      )}
    </main>
  )
}
