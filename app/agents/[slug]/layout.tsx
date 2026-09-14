import type { Metadata } from "next"
import type { ReactNode } from "react"

import { getAgent } from "../agentCatalog"
import { getAgentSalesOffer } from "../agentSales"

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const agent = getAgent(slug)

  if (!agent) return {}

  const offer = getAgentSalesOffer(agent)
  const title = `${agent.name} | Aspect Marketing Solutions`
  const description = `${agent.description} ${offer.price}. Review current availability and the verified AMS purchase path.`
  const url = `https://www.aspectmarketingsolutions.app/agents/${agent.slug}`

  return {
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
}

export default function AgentSalesLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children
}
