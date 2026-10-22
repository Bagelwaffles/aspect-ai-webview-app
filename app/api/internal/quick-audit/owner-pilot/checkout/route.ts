import { createOwnerPilotCheckoutHandler } from "@/lib/server/quick-audit-owner-pilot"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Privately available only to the verified AMS admin on an approved Vercel Preview.
// Disabled by default; this endpoint uses Stripe TEST keys, never live charges.
export const POST = createOwnerPilotCheckoutHandler()
