import type { Metadata } from "next"
import type { ReactNode } from "react"

const title = "$49 Quick Marketing Audit | Aspect Marketing Solutions"
const description =
  "Find five marketing problems, get five specific fixes, stronger messaging, one ready-to-use promotional post, and a practical 7-day plan for $49 one time."
const url = "https://www.aspectmarketingsolutions.app/quick-marketing-audit"

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

export default function QuickMarketingAuditLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children
}
