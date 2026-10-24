import Link from "next/link"
import { getServerSession } from "next-auth"
import { authOptions, isCustomerAuthConfigured } from "@/lib/auth"
import { ResendPreviewControls } from "./resend-preview-controls"

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
            non-payment Redis key. No checkout, customer email, provider send,
            administrative Resend credential, or production write is performed.
          </p>
        </div>
        {authorized ? (
          <ResendPreviewControls />
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
