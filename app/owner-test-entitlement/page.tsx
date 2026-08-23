import { getServerSession } from "next-auth"

import { authOptions } from "@/lib/auth"
import OwnerContentProofClient from "./OwnerContentProofClient"

export const dynamic = "force-dynamic"

export default async function OwnerTestEntitlementPage() {
  const session = await getServerSession(authOptions)
  const ownerEmail = process.env.AMS_OWNER_EMAIL?.trim().toLowerCase()
  const signedInEmail = session?.user?.email?.trim().toLowerCase()
  const enabled = process.env.AMS_OWNER_TEST_ENTITLEMENT_ENABLED === "true"
  const authorized = Boolean(enabled && ownerEmail && signedInEmail === ownerEmail)

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
          <p className="mt-8 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            This control is disabled or the signed session is not the AMS owner.
          </p>
        )}
      </section>
    </main>
  )
}
