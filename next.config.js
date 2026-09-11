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
