import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { verifyInternalAdminCookie } from "@/app/lib/internal-admin-cookie"

import BrowserOperatorClient from "./BrowserOperatorClient"

export const dynamic = "force-dynamic"

export default async function BrowserOperatorPage() {
  const cookieStore = await cookies()
  const adminAccess = cookieStore.get("ams_internal_admin_access")?.value
  const expectedSecret = process.env.INTERNAL_ADMIN_SECRET?.trim()
  const adminSession = expectedSecret
    ? await verifyInternalAdminCookie(adminAccess, expectedSecret)
    : null

  if (!adminSession?.email) {
    redirect("/admin/login?next=/dashboard/browser-control/operator")
  }

  return <BrowserOperatorClient />
}
