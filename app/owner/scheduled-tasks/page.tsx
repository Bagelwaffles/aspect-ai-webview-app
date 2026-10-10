import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import GmailConnections from "./GmailConnections"
import ScheduledTasksClient from "./ScheduledTasksClient"
export const dynamic = "force-dynamic"
export default async function ScheduledTasksPage() {
  const session = await getServerSession(authOptions)
  const owner = process.env.AMS_OWNER_EMAIL?.trim().toLowerCase()
  if (!owner || session?.user?.email?.trim().toLowerCase() !== owner) redirect("/login?next=/owner/scheduled-tasks")
  return <main className="mx-auto min-h-screen max-w-5xl px-4 py-8"><h1 className="text-2xl font-semibold">Scheduled Tasks</h1><p className="my-3 text-sm text-muted-foreground">AMS cloud jobs, execution history, and notification receipts. Times use America/Chicago. New replacements start paused until production configuration and delivery are verified.</p><GmailConnections /><ScheduledTasksClient /></main>
}
