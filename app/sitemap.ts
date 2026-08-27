import type { MetadataRoute } from "next"

const baseUrl = "https://www.aspectmarketingsolutions.app"

const routes = [
  { path: "", changeFrequency: "daily" as const, priority: 1 },
  { path: "/pricing", changeFrequency: "daily" as const, priority: 0.9 },
  { path: "/quick-marketing-audit", changeFrequency: "daily" as const, priority: 0.9 },
  { path: "/agents", changeFrequency: "weekly" as const, priority: 0.8 },
  { path: "/agents/content-agent", changeFrequency: "weekly" as const, priority: 0.8 },
  { path: "/agents/lead-magnet-agent", changeFrequency: "weekly" as const, priority: 0.8 },
  { path: "/agents/outreach-agent", changeFrequency: "weekly" as const, priority: 0.8 },
  { path: "/agents/seo-agent", changeFrequency: "weekly" as const, priority: 0.8 },
  { path: "/agents/email-campaign-agent", changeFrequency: "weekly" as const, priority: 0.8 },
  { path: "/contact", changeFrequency: "monthly" as const, priority: 0.6 },
] as const

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  return routes.map((route) => ({
    url: `${baseUrl}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))
}
