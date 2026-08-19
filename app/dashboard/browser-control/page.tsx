import Link from "next/link"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { verifyInternalAdminCookie } from "@/app/lib/internal-admin-cookie"

import BrowserControlClient from "./BrowserControlClient"

export const dynamic = "force-dynamic"

export default async function BrowserControlPage() {
  const cookieStore = await cookies()
  const adminAccess = cookieStore.get("ams_internal_admin_access")?.value
  const expectedSecret = process.env.INTERNAL_ADMIN_SECRET?.trim()
  const adminSession = expectedSecret
    ? await verifyInternalAdminCookie(adminAccess, expectedSecret)
    : null

  if (!adminSession?.email) {
    redirect("/admin/login?next=/dashboard/browser-control")
  }

  return (
    <>
      <div className="fixed bottom-4 right-4 z-50">
        <Link
          href="/dashboard/browser-control/fiverr"
          className="inline-flex rounded-full border border-emerald-400/30 bg-slate-950/95 px-4 py-2 text-xs font-black uppercase tracking-wider text-emerald-200 shadow-xl shadow-black/40"
        >
          Fiverr Phase 1 →
        </Link>
      </div>
      <BrowserControlClient />
    </>
  )
}
