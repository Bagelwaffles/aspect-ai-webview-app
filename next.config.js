/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
      { protocol: "https", hostname: "vo.aspectmarketingsolutions.app" },
    ],
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "https://vo.aspectmarketingsolutions.app" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
    ]
  },
}

module.exports = nextConfig
