import type { Metadata } from "next"
import type { ReactNode } from "react"

const title = "AMS Agent Store | 7 Live AI Agents"
const description =
  "Browse the Aspect Marketing Solutions Agent Store, including seven production-verified Live subscription agents plus clearly labeled Beta, Setup Required, Blocked, and Planned capabilities."
const url = "https://www.aspectmarketingsolutions.app/agents"

export const metadata: Metadata = {
  alternates: { canonical: url },
  openGraph: {
    type: "website",
    url,
    siteName: "Aspect Marketing Solutions",
    title,
    description,
  },
  twitter: {
    card: "summary",
    title,
    description,
  },
}

export default function AgentsLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children
}
