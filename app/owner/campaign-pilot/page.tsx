import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"

import { authOptions } from "@/lib/auth"
import OwnerCampaignPilotPanel from "./OwnerCampaignPilotPanel"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default async function OwnerCampaignPilotPage() {
  const session = await getServerSession(authOptions).catch(() => null)
  const signedIn = session?.user?.email?.trim().toLowerCase() ?? ""
  const owner = process.env.AMS_OWNER_EMAIL?.trim().toLowerCase() ?? ""
  if (!owner || signedIn !== owner) redirect("/login?next=/owner/campaign-pilot")
  const primary = process.env.AMS_GMAIL_PRIMARY_EMAIL?.trim().toLowerCase() ?? ""
  const secondary = process.env.AMS_GMAIL_SECONDARY_EMAIL?.trim().toLowerCase() ?? ""
  return <OwnerCampaignPilotPanel primary={primary} secondary={secondary} />
}
