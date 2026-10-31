/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/health",
        destination: "/api/health",
      },
    ]
  },
  async headers() {
    const privateReportHeaders = [
      { key: "Cache-Control", value: "private, no-store, max-age=0" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
    ]
    return [
      { source: "/quick-marketing-audit/thanks", headers: privateReportHeaders },
      { source: "/api/quick-marketing-audit/result", headers: privateReportHeaders },
    ]
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.printify.com" },
      { protocol: "https", hostname: "cdn.printify.com" },
      { protocol: "https", hostname: "aspectmarketingsolutions.app" },
      { protocol: "https", hostname: "www.aspectmarketingsolutions.app" },
    ],
    unoptimized: true,
  },
}

module.exports = nextConfig
