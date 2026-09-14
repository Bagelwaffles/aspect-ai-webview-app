import type { Metadata } from "next"
import type { ReactNode } from "react"

const title = "AMS Services | Aspect Marketing Solutions"
const description =
  "See verified Aspect Marketing Solutions offers: seven Live shared-credit AI agents, the $49 Quick Marketing Audit, and scoped services available by human-reviewed request."
const url = "https://www.aspectmarketingsolutions.app/ethical-agent-farm"

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

export default function ServicesLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children
}
