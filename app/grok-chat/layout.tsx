import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"

import { authOptions, isCustomerAuthConfigured } from "@/lib/auth"

export const dynamic = "force-dynamic"

export default async function GrokChatLayout({ children }: { children: React.ReactNode }) {
  if (!isCustomerAuthConfigured()) {
    redirect("/login?next=/grok-chat")
  }

  const session = await getServerSession(authOptions).catch(() => null)
  if (!session?.user?.email) {
    redirect("/login?next=/grok-chat")
  }

  return children
}
