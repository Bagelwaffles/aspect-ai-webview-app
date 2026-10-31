import Link from "next/link"
import { isBuyerReportAccessConfigured } from "@/lib/server/quick-audit-report-access"
import { inspectBuyerLinkGate, buyerLinkRehearsalEnvironment } from "@/lib/server/quick-audit-buyer-link-gate-diagnostic"
import { pilotDispatchConfiguration, pilotStorageConfiguration } from "@/lib/server/quick-audit-isolated-stripe-pilot"
import { getServerSession } from "next-auth"
import { authOptions, isCustomerAuthConfigured } from "@/lib/auth"
import { ResendPreviewControls } from "./resend-preview-controls"
import { StripeReceiptControls } from "./stripe-receipt-controls"
import { StripeAcceptanceControls } from "./stripe-acceptance-controls"
import { ConnectivityControls } from "./connectivity-controls"
import { DomainVerificationControls } from "./domain-verification-controls"
import { ManualResendDispatchControls } from "./manual-resend-dispatch-controls"
import { BuyerLinkDispatchControls } from "./buyer-link-dispatch-controls"
import { ownerDomainVerificationEnabled } from "@/lib/server/quick-audit-resend-owner-verification"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The page is owner-gated independently of its API routes. It never includes
 * credentials or contact addresses in HTML. Do not substitute admin PIN
 * authentication or a Vercel share link for the signed customer identity.
 */
export default async function ResendPreviewOwnerPage() {
  const session = isCustomerAuthConfigured()
    ? await getServerSession(authOptions).catch(() => null)
    : null
  const email = session?.user?.email?.trim().toLowerCase()
  const expected = process.env.AMS_OWNER_EMAIL?.trim().toLowerCase()
  const authorized = Boolean(expected && email && email === expected)

  const now = Date.now()
  const inspected = inspectBuyerLinkGate(process.env, pilotDispatchConfiguration(process.env, now), now)
  const rehearsalEnv = { ...buyerLinkRehearsalEnvironment(process.env, now), NODE_ENV: process.env.NODE_ENV }
  const rehearsal = inspectBuyerLinkGate(rehearsalEnv, pilotDispatchConfiguration(rehearsalEnv, now), now)
  const diagnosticAllowed = authorized && inspected.checks.previewEnvironment && inspected.checks.expectedBranch

  return (
    <main className="min-h-screen bg-[#080d17] px-5 py-12 text-slate-100">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="rounded-2xl border border-slate-700 bg-slate-900/75 p-6 shadow-lg">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
            Aspect Marketing Solutions / Preview only
          </p>
          <h1 className="mt-3 text-2xl font-semibold">Resend owner verification</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            Inspect branch-isolated configuration or manually check one temporary
            non-payment Redis key. Owner-triggered Stripe TEST acceptance is available only
            during a separately authorized short sandbox window; opening this page
            does not create a Checkout, perform a payment, or send an email.
          </p>
        </div>
        {authorized ? (
          <>
            {diagnosticAllowed && <section className="rounded-xl border border-slate-700 p-5" aria-label="Buyer-link no-send gate diagnostic">
              <h2 className="font-semibold">Buyer-link no-send gate diagnostic</h2>
              <p>Runtime configuration only. No provider, Redis, proof or send operation is performed.</p>
              <p>Deployment: {process.env.VERCEL_DEPLOYMENT_ID ?? "unavailable"}; commit: {process.env.VERCEL_GIT_COMMIT_SHA ?? "unavailable"}</p>
              <p>Actual gate: {inspected.ready ? "armed" : "blocked"}; pilot check: {inspected.pilotCode}</p>
              <p>Isolated TEST storage configuration: {pilotStorageConfiguration(process.env).ready ? "PASS" : "FAIL"}</p>
              <p>Stripe key category: {inspected.stripeKeyKind}</p>
              <p>Report-access secret present: {String(Boolean(process.env.AMS_QUICK_AUDIT_REPORT_ACCESS_SECRET))}</p>
              <p>Report-access secret trimmed length: {process.env.AMS_QUICK_AUDIT_REPORT_ACCESS_SECRET?.trim().length ?? 0}; minimum: 32</p>
              <p>Report-access secret predicate: {isBuyerReportAccessConfigured(process.env.AMS_QUICK_AUDIT_REPORT_ACCESS_SECRET) ? "PASS" : "REPORT_ACCESS_SECRET_INVALID"}</p>
              <p>Pilot window: {inspected.pilotWindow}; buyer window: {inspected.buyerWindow}</p>
              <ul>{Object.entries(inspected.checks).map(([name, pass]) => <li key={name}>{name}: {String(pass)}</li>)}</ul>
              <p>In-memory armed-configuration rehearsal: {rehearsal.ready ? "PASS" : "FAIL"}. Actual flags remain unchanged.</p>
              <p>Rehearsal blockers: {Object.entries(rehearsal.checks).filter(([, pass]) => !pass).map(([name]) => name).join(", ") || "none"}</p>
              <p>This does not verify domain-proof freshness, payment, provider permissions or readiness to send.</p>
            </section>}
            <ResendPreviewControls />
            <StripeReceiptControls />
            <StripeAcceptanceControls />
            <ConnectivityControls />
            {ownerDomainVerificationEnabled(process.env) && <DomainVerificationControls />}
            <ManualResendDispatchControls />
            <BuyerLinkDispatchControls />
          </>
        ) : (
          <section className="rounded-xl border border-amber-500/40 bg-amber-950/25 p-5">
            <h2 className="font-semibold text-amber-200">Owner session required</h2>
            <p className="mt-2 text-sm text-slate-300">
              This Preview cannot perform the probe until a valid AMS owner
              Google session is available on this same deployment origin.
              Vercel project access by itself is not AMS owner authentication.
            </p>
            <Link className="mt-4 inline-block text-sm font-semibold text-cyan-300 underline"
              href="/login?next=/owner/resend-preview">
              Check sign-in configuration
            </Link>
          </section>
        )}
        <p className="text-xs text-slate-400">
          Delivery remains disabled. A successful storage test is not
          Resend-domain proof, Stripe isolation, or permission to email customers.
        </p>
      </div>
    </main>
  )
}

