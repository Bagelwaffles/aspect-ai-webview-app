import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/api/", "/billing/", "/dashboard/", "/delete-account/"],
    },
    sitemap: "https://www.aspectmarketingsolutions.app/sitemap.xml",
    host: "https://www.aspectmarketingsolutions.app",
  }
}
