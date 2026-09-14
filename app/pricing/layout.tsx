import type { Metadata } from "next"
import type { ReactNode } from "react"

const title = "AMS Pricing | 7 Live AI Agents from $29/month"
const description =
  "Compare Aspect Marketing Solutions plans with seven Live shared-credit AI agents from $29/month, or start with the $49 Quick Marketing Audit."
const url = "https://www.aspectmarketingsolutions.app/pricing"

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

export default function PricingLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children
}
