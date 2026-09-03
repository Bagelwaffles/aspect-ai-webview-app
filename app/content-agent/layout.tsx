import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Content Agent | Aspect Marketing Solutions",
  description:
    "Authenticated AMS Content Agent workspace. Public execution availability is controlled by the production launch gate.",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
}

export default function ContentAgentLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
