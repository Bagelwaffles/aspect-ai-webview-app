// AMS Browser Control provider registry.
//
// Browser Control operates on top-level job URLs. Provider-owned subdomains are
// allowed here so normal OAuth, developer-console, dashboard, and documentation
// redirects do not fail one hostname at a time. User-content multi-tenant domains
// (for example arbitrary *.vercel.app, *.myshopify.com, github.io) are intentionally
// NOT wildcarded.

export const AMS_BROWSER_PROVIDER_SUFFIXES = [
  // AMS-owned web properties
  "aspectmarketingsolutions.app",

  // Source control / deployment control planes
  "github.com",
  "vercel.com",

  // LinkedIn + official LinkedIn/Microsoft documentation
  "linkedin.com",
  "microsoft.com",

  // Meta / social publishing
  "facebook.com",
  "instagram.com",
  "pinterest.com",
  "reddit.com",
  "tiktok.com",
  "x.com",
  "twitter.com",
  "x.ai",

  // Google / YouTube / Play / Firebase / Workspace
  "google.com",
  "youtube.com",
  "youtu.be",

  // Creator / streaming
  "twitch.tv",
  "streamlabs.com",

  // Sales / commerce / payments
  "fiverr.com",
  "stripe.com",
  "shopify.com",
  "printify.com",
  "etsy.com",
  "namecheap.com",

  // Messaging / automation / agent infrastructure
  "slack.com",
  "telegram.org",
  "pipedream.com",
  "relevanceai.com",
  "n8n.cloud",

  // Creative / video tooling
  "canva.com",
  "heygen.com",

  // AI platform research / operations
  "openai.com",
  "chatgpt.com",
  "anthropic.com",
  "claude.ai",
  "v0.dev",
  "manus.im",
] as const

// Vercel's *.vercel.app namespace is multi-tenant user content, so never allow the
// whole suffix. Only AMS project-generated hostnames are accepted.
const AMS_OWNED_VERCEL_APP_PATTERNS = [
  /^aspect-ai-overlord(?:-[a-z0-9-]+)?\.vercel\.app$/,
  /^v0-aspect-ai-v0-handoff20250830(?:-[a-z0-9-]+)?\.vercel\.app$/,
] as const

export function isAmsBrowserProviderHost(rawHostname: string): boolean {
  const hostname = rawHostname.trim().toLowerCase().replace(/\.$/, "")
  if (!hostname) return false

  if (
    AMS_BROWSER_PROVIDER_SUFFIXES.some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
    )
  ) {
    return true
  }

  return AMS_OWNED_VERCEL_APP_PATTERNS.some((pattern) => pattern.test(hostname))
}
