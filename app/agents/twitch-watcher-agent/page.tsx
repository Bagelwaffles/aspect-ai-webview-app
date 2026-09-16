import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Streamer Agent Status | Aspect Marketing Solutions",
  robots: {
    index: false,
    follow: true,
  },
}

export default function StreamerAgentStatusAliasPage() {
  redirect("/agents#catalog")
}
