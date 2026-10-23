import type React from "react"
import type { Metadata } from "next"
import { AMS_BRAND_ASSETS } from "@/lib/ams-brand-assets"
import { MarketingAttribution } from "@/components/marketing-attribution"
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
  keywords: [
    "AI marketing agents",
    "small business marketing",
    "marketing automation",
    "AI content marketing",
    "marketing audit",
    "Aspect Marketing Solutions",
  ],
  icons: { icon: [{ url: AMS_BRAND_ASSETS.icon, type: "image/png" }], apple: [{ url: AMS_BRAND_ASSETS.icon }] },
  openGraph: {
    images: [{ url: AMS_BRAND_ASSETS.hero, width: 1536, height: 864, alt: "Aspect Marketing Solutions — AI Agents, Automation, Growth" }],
    type: "website",
    url: siteUrl,
    siteName: "Aspect Marketing Solutions",
    title,
    description,
  },
  twitter: {
    card: "summary_large_image",
    images: [AMS_BRAND_ASSETS.hero],
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
      <body className="min-h-screen bg-background font-sans antialiased">
        <MarketingAttribution />
        {children}
      </body>
    </html>
  )
}
