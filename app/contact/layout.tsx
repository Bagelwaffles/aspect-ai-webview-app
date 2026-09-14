import type { Metadata } from "next"
import type { ReactNode } from "react"

const title = "Start with AMS | Aspect Marketing Solutions"
const description =
  "Choose the fastest verified way to start with Aspect Marketing Solutions: the $49 Quick Marketing Audit, seven Live AI agents, or the AMS Agent Store."
const url = "https://www.aspectmarketingsolutions.app/contact"

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

export default function ContactLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children
}
