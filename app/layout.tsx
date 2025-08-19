import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import "./globals.css"

export const metadata: Metadata = {
  title: "Aspect Marketing Solutions",
  description: "Professional marketing solutions and services",
  generator: "Next.js",
  manifest: "/manifest.json",
  keywords: ["marketing", "business", "solutions", "professional"],
  authors: [{ name: "Aspect Marketing Solutions" }],
  icons: {
    icon: "/icon-192x192.png",
    apple: "/icon-192x192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Aspect Marketing Solutions",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: "Aspect Marketing Solutions",
    title: "Aspect Marketing Solutions",
    description: "Professional marketing solutions and services",
  },
  twitter: {
    card: "summary",
    title: "Aspect Marketing Solutions",
    description: "Professional marketing solutions and services",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="application-name" content="Aspect Marketing Solutions" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Aspect Marketing Solutions" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-config" content="/browserconfig.xml" />
        <meta name="msapplication-TileColor" content="#0b0d10" />
        <meta name="msapplication-tap-highlight" content="no" />
        <meta name="theme-color" content="#0b0d10" />

        <link rel="apple-touch-icon" href="/icon-192x192.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192x192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon-512x512.png" />
        <link rel="manifest" href="/manifest.json" />

        <style>{`
html {
  font-family: ${GeistSans.style.fontFamily};
  --font-sans: ${GeistSans.variable};
  --font-mono: ${GeistMono.variable};
}
        `}</style>
      </head>
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js')
                    .then(function(registration) {
                      console.log('[SW] Registration successful: ', registration.scope);
                    })
                    .catch(function(error) {
                      console.log('[SW] Registration failed: ', error);
                    });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  )
}
