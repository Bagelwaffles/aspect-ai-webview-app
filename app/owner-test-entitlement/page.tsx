import Link from "next/link"
import { getServerSession } from "next-auth"

import { authOptions } from "@/lib/auth"
import OwnerContentProofClient from "./OwnerContentProofClient"

export const dynamic = "force-dynamic"

export default async function OwnerTestEntitlementPage() {
  const session = await getServerSession(authOptions)
  const ownerEmail = process.env.AMS_OWNER_EMAIL?.trim().toLowerCase()
  const signedInEmail = session?.user?.email?.trim().toLowerCase()
  const authorized = Boolean(ownerEmail && signedInEmail === ownerEmail)

  let accessMessage = "Sign in with the AMS owner account to run the production proof."
  if (!ownerEmail) {
    accessMessage = "The AMS owner identity is not configured in production."
  } else if (signedInEmail && signedInEmail !== ownerEmail) {
    accessMessage = "This browser is signed into AMS with a different account. Sign out, then sign in with the AMS owner account."
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-16">
      <section className="w-full rounded-2xl border border-white/10 bg-black/40 p-8">
        <p className="text-xs uppercase tracking-[0.24em] text-cyan-300">AMS owner control</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Content Agent production proof</h1>
        <p className="mt-4 text-sm leading-6 text-zinc-300">
          This owner-only control grants the one-time Content Agent test entitlement and runs one fixed production generation through the AMS Vercel agent runtime. It does not create a Stripe subscription or recurring charge, and it does not post or send anything externally.
        </p>

        {authorized ? (
          <OwnerContentProofClient />
        ) : (
          <div className="mt-8 space-y-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            <p>{accessMessage}</p>
            {ownerEmail ? (
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/login?callbackUrl=%2Fowner-test-entitlement"
                  className="rounded-lg bg-cyan-400 px-4 py-2 font-semibold text-black hover:bg-cyan-300"
                >
                  Sign in to AMS
                </Link>
                {signedInEmail ? (
                  <Link
                    href="/api/auth/signout"
                    className="rounded-lg border border-white/20 px-4 py-2 font-semibold text-white hover:bg-white/10"
                  >
                    Sign out current account
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </section>
    </main>
  )
}
