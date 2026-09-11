import type { Metadata } from "next"
import type { ReactNode } from "react"

export const metadata: Metadata = {
  title: "Product Creator Agent | AMS",
  robots: { index: false, follow: false },
}

export default function ProductCreatorLayout({ children }: { children: ReactNode }) {
  return children
}
