import type { Metadata } from "next"
import type { ReactNode } from "react"

export const metadata: Metadata = {
  title: "Nurture Agent | AMS",
  robots: { index: false, follow: false },
}

export default function NurtureLayout({ children }: { children: ReactNode }) {
  return children
}
