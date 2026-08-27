import type React from "react"
import type { Metadata } from "next"
import "./globals.css"

const siteUrl = "https://www.aspectmarketingsolutions.app"
const title = "Aspect Marketing Solutions | AI Agents Built to Work"
const description =
  "Aspect Marketing Solutions gives small businesses practical AI marketing agents, shared generation credits, and a focused $49 Quick Marketing Audit."

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "Aspect Marketing Solutions",
  title,
  description,
  alternates: {
    canonical: "/",
  },
  keywords: [
    "AI marketing agents",
    "small business marketing",
    "marketing automation",
    "AI content marketing",
    "marketing audit",
    "Aspect Marketing Solutions",
  ],
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Aspect Marketing Solutions",
    title,
    description,
  },
  twitter: {
    card: "summary",
    title,
    description,
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background font-sans antialiased">{children}</body>
    </html>
  )
}
