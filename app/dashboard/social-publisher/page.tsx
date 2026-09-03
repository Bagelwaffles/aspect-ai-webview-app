import Link from "next/link"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { verifyInternalAdminCookie } from "@/app/lib/internal-admin-cookie"
import { getLinkedInOrganizationCutoverStatus } from "@/lib/server/linkedin-organization-cutover"
import { isSocialCampaignAgentConfigured } from "@/lib/server/social-campaign-agent"
import {
  isSocialCampaignStoreConfigured,
  listSocialCampaignRecords,
  type SocialCampaignRecord,
} from "@/lib/server/social-campaign-store"
import { getSocialPublisherConfiguration } from "@/lib/server/social-publisher"

export const dynamic = "force-dynamic"

const channelLabels = {
  linkedin: "LinkedIn",
  facebook: "Facebook Page",
  instagram: "Instagram",
  pinterest: "Pinterest",
  "youtube-shorts": "YouTube Shorts",
} as const

function statusClasses(ok: boolean) {
  return ok
    ? "border-emerald-400/25 bg-emerald-400/5 text-emerald-200"
    : "border-slate-700 bg-slate-900/70 text-slate-300"
}

function deliveryClasses(status: string) {
  if (status === "published") return "text-emerald-300"
  if (status === "failed" || status === "not_configured") return "text-amber-300"
  if (status === "publishing") return "text-sky-300"
  return "text-slate-300"
}

export default async function SocialPublisherStatusPage() {
  const cookieStore = await cookies()
  const adminAccess = cookieStore.get("ams_internal_admin_access")?.value
  const expectedSecret = process.env.INTERNAL_ADMIN_SECRET?.trim()
  const adminSession = expectedSecret
    ? await verifyInternalAdminCookie(adminAccess, expectedSecret)
    : null

  if (!adminSession?.email) {
    redirect("/admin/login?next=/dashboard/social-publisher")
  }

  const agentConfigured = isSocialCampaignAgentConfigured()
  const storeConfigured = isSocialCampaignStoreConfigured()
  const linkedinCutover = getLinkedInOrganizationCutoverStatus()
  const rawPublishers = getSocialPublisherConfiguration()
  const publishers = { ...rawPublishers, linkedin: linkedinCutover.configured }
  let campaigns: SocialCampaignRecord[] = []
  let storeReadError = false

  if (storeConfigured) {
    try {
      campaigns = await listSocialCampaignRecords(10)
    } catch {
      storeReadError = true
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="space-y-4">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-sky-300">
            AMS // Owner Social Lane
          </p>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
            Social publisher status.
          </h1>
          <p className="max-w-3xl text-base leading-7 text-slate-300">
            Read-only production visibility for the approval-first AMS social publisher. This page shows configuration state and durable delivery results only. Provider tokens are never rendered, and this page cannot publish a post.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className={`rounded-2xl border p-5 ${statusClasses(agentConfigured)}`}>
            <p className="text-xs font-black uppercase tracking-[0.2em]">Campaign agent</p>
            <p className="mt-2 text-2xl font-black">{agentConfigured ? "Configured" : "Unavailable"}</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Draft generation through the Vercel-native structured agent runtime.
            </p>
          </div>
          <div className={`rounded-2xl border p-5 ${statusClasses(storeConfigured && !storeReadError)}`}>
            <p className="text-xs font-black uppercase tracking-[0.2em]">Durable campaign store</p>
            <p className="mt-2 text-2xl font-black">
              {!storeConfigured ? "Unavailable" : storeReadError ? "Read error" : "Configured"}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Redis-backed campaign state, approval state, idempotency, and delivery evidence.
            </p>
          </div>
        </section>

        {linkedinCutover.legacyCredentialPresent ? (
          <section className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5">
            <p className="font-bold text-amber-200">LinkedIn legacy identity quarantined</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              AMS detected an older LinkedIn credential but will not use it. LinkedIn publishing stays blocked until a fresh organization-only connection is authorized for the Aspect Marketing Solutions Page and the new connection generation is installed.
            </p>
          </section>
        ) : null}

        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black">Provider readiness</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                A provider is marked ready only when its required server-side configuration passes the adapter validation rules.
              </p>
            </div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">No secret values shown</p>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(publishers).map(([channel, configured]) => {
              const label = channelLabels[channel as keyof typeof channelLabels]
              const intentionallyClosed = channel === "youtube-shorts"
              const linkedinHeld = channel === "linkedin" && linkedinCutover.legacyCredentialPresent
              return (
                <div key={channel} className={`rounded-xl border p-4 ${statusClasses(configured)}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold">{label}</p>
                    <span className="text-xs font-black uppercase tracking-[0.15em]">
                      {configured
                        ? "Ready"
                        : intentionallyClosed
                          ? "Held closed"
                          : linkedinHeld
                            ? "Cutover required"
                            : "Not ready"}
                    </span>
                  </div>
                  {intentionallyClosed ? (
                    <p className="mt-2 text-xs leading-5 text-slate-400">
                      Upload stays disabled until a verified server-side Shorts uploader completes a controlled test.
                    </p>
                  ) : linkedinHeld ? (
                    <p className="mt-2 text-xs leading-5 text-slate-400">
                      Only a fresh Aspect Marketing Solutions organization connection can re-enable LinkedIn publishing.
                    </p>
                  ) : null}
                </div>
              )
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black">Recent campaigns</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Up to ten durable campaign records. External IDs are provider proof, not credentials.
              </p>
            </div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Approval-first</p>
          </div>

          {!storeConfigured ? (
            <p className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200">
              The social campaign store is not configured in this environment.
            </p>
          ) : storeReadError ? (
            <p className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200">
              The campaign store is configured but could not be read. No publishing action was attempted.
            </p>
          ) : campaigns.length === 0 ? (
            <p className="mt-6 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-400">
              No durable social campaigns have been created yet.
            </p>
          ) : (
            <div className="mt-6 space-y-4">
              {campaigns.map((campaign) => (
                <article key={campaign.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-100">{campaign.output.campaignName}</p>
                      <p className="mt-1 break-all font-mono text-xs text-slate-500">{campaign.id}</p>
                    </div>
                    <span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-slate-300">
                      {campaign.status}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {campaign.deliveries.map((delivery) => (
                      <div key={delivery.channel} className="rounded-lg border border-slate-800 px-3 py-2">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span>{channelLabels[delivery.channel]}</span>
                          <span className={`font-bold ${deliveryClasses(delivery.status)}`}>
                            {delivery.status}
                          </span>
                        </div>
                        {delivery.externalId ? (
                          <p className="mt-1 break-all font-mono text-[11px] text-slate-500">
                            {delivery.externalId}
                          </p>
                        ) : null}
                        {delivery.errorCode ? (
                          <p className="mt-1 break-all font-mono text-[11px] text-amber-300/80">
                            {delivery.errorCode}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5">
          <p className="font-bold text-amber-200">Publishing stays gated</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            This lane deliberately has no publish button. AMS still requires an explicitly approved campaign through the protected publisher path before any external post can be sent.
          </p>
        </section>

        <div className="flex flex-wrap gap-3 text-sm">
          <Link className="rounded-lg border border-slate-700 px-4 py-2 hover:bg-slate-900" href="/dashboard">
            Back to dashboard
          </Link>
          <Link className="rounded-lg border border-slate-700 px-4 py-2 hover:bg-slate-900" href="/agents">
            View agent catalog
          </Link>
        </div>
      </div>
    </main>
  )
}
