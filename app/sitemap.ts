import type { MetadataRoute } from "next"

const baseUrl = "https://www.aspectmarketingsolutions.app"

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const routes = [
    "",
    "/pricing",
    "/agents",
    "/quick-marketing-audit",
    "/contact",
    "/login",
  ]

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: now,
    changeFrequency: route === "" || route === "/pricing" ? "daily" : "weekly",
    priority: route === "" ? 1 : route === "/pricing" || route === "/quick-marketing-audit" ? 0.9 : 0.7,
  }))
}
