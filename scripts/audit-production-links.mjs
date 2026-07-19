import { writeFile, mkdir } from "node:fs/promises"
import { dirname, resolve, posix } from "node:path"
import { fileURLToPath } from "node:url"

const BASE_URL = "https://www.aspectmarketingsolutions.app"
const BASE_HOST = new URL(BASE_URL).host
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const REPORT_DIR = resolve(ROOT, "..", "_reports")
const JSON_REPORT_PATH = resolve(REPORT_DIR, "ams_production_link_audit.json")
const MD_REPORT_PATH = resolve(REPORT_DIR, "AMS_PRODUCTION_LINK_AUDIT.md")

const VIEWPORTS = [
  { name: "desktop", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" },
  { name: "mobile", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" },
]

const REQUIRED_PAGES = [
  "/",
  "/pricing",
  "/billing",
  "/billing/success",
  "/terms",
  "/privacy",
  "/refund",
  "/request-access",
  "/reviewer-access",
  "/ai-command",
  "/agents",
  "/relevance-ai",
  "/grok-chat",
  "/deployments",
  "/products",
  "/products/new",
  "/workflows",
  "/workflows/new",
  "/analytics",
  "/settings",
  "/notifications",
  "/ethical-agent-farm",
  "/ethical-agent-farm/offers/quick-marketing-audit",
  "/ethical-agent-farm/offers/social-content-pack",
  "/ethical-agent-farm/offers/website-profile-review",
  "/ethical-agent-farm/offers/business-cleanup-plan",
  "/ethical-agent-farm/offers/monthly-marketing-support",
  "/ethical-agent-farm/request",
  "/ethical-agent-farm/request/success",
]

const INTERNAL_LINK_ALLOWLIST = new Set([
  "/billing",
  "/billing/success",
  "/ethical-agent-farm",
  "/ethical-agent-farm/request",
  "/ethical-agent-farm/request/success",
  "/ethical-agent-farm/offers/quick-marketing-audit",
  "/ethical-agent-farm/offers/social-content-pack",
  "/ethical-agent-farm/offers/website-profile-review",
  "/ethical-agent-farm/offers/business-cleanup-plan",
  "/ethical-agent-farm/offers/monthly-marketing-support",
  "/pricing",
  "/products",
  "/agents",
  "/ai-command",
  "/deployments",
  "/grok-chat",
  "/analytics",
  "/settings",
  "/notifications",
  "/relevance-ai",
  "/workflows",
  "/workflows/new",
  "/products/new",
  "/terms",
  "/privacy",
  "/refund",
  "/admin/login",
  "/admin/ethical-agent-farm-requests",
  "/reviewer-access",
  "/request-access",
])

function normalizePath(href) {
  if (!href) return null
  const value = href.trim()
  if (!value || value === "#" || value === "/" || value.startsWith("javascript:")) {
    return value === "/" ? "/" : null
  }
  if (value.startsWith("mailto:") || value.startsWith("tel:")) {
    return value
  }
  try {
    const url = new URL(value, BASE_URL)
    if (url.host !== BASE_HOST) {
      return url.href
    }
    const path = `${url.pathname}${url.search}${url.hash}`
    return path || "/"
  } catch {
    return null
  }
}

function stripHash(url) {
  try {
    const u = new URL(url, BASE_URL)
    return `${u.pathname}${u.search}` || "/"
  } catch {
    return url
  }
}

function isInternal(url) {
  try {
    return new URL(url, BASE_URL).host === BASE_HOST
  } catch {
    return false
  }
}

function leakFindings(html) {
  const needles = [
    "localhost",
    "127.0.0.1",
    "host.docker.internal",
    "DB_URL",
    "DATABASE_URL",
    "STRIPE_SECRET_KEY",
    "INTERNAL_ADMIN_SECRET",
    "stack trace",
    "Error:",
  ]
  const lower = html.toLowerCase()
  return needles.filter((needle) => lower.includes(needle.toLowerCase()))
}

function extractLinks(html) {
  const links = []
  const forms = []
  const anchors = [...html.matchAll(/<a\b[^>]*href="([^"]+)"/gi)]
  for (const match of anchors) {
    links.push({ tag: "a", href: match[1] })
  }
  const formsMatches = [...html.matchAll(/<form\b[^>]*action="([^"]+)"/gi)]
  for (const match of formsMatches) {
    forms.push({ tag: "form", href: match[1] })
  }
  const buttonLinks = [...html.matchAll(/<button\b[^>]*data-endpoint="([^"]+)"/gi)]
  for (const match of buttonLinks) {
    links.push({ tag: "button", href: match[1] })
  }
  return [...links, ...forms]
}

async function fetchPage(path, viewport) {
  const url = new URL(path, BASE_URL).toString()
  const response = await fetch(url, {
    headers: {
      "user-agent": viewport.userAgent,
      accept: "text/html,application/xhtml+xml",
    },
  })
  const html = await response.text()
  return { url, status: response.status, html, finalUrl: response.url }
}

async function checkApi(method, path, body, headers = {}) {
  const response = await fetch(new URL(path, BASE_URL), {
    method,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    redirect: "manual",
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return { status: response.status, text, json }
}

async function main() {
  await mkdir(REPORT_DIR, { recursive: true })

  const pageResults = []
  const linkResults = []
  const leakResults = []
  const routeStatus = []
  const seenLinks = new Set()

  for (const page of REQUIRED_PAGES) {
    const perViewport = {}
    for (const viewport of VIEWPORTS) {
      const result = await fetchPage(page, viewport)
      perViewport[viewport.name] = {
        status: result.status,
        finalUrl: result.finalUrl,
        leakFindings: leakFindings(result.html),
        linkCount: extractLinks(result.html).length,
      }
      const pageLeaks = leakFindings(result.html)
      if (pageLeaks.length) {
        leakResults.push({ page, viewport: viewport.name, findings: pageLeaks })
      }

      const rawLinks = extractLinks(result.html)
      for (const item of rawLinks) {
        const normalized = normalizePath(item.href)
        if (!normalized) {
          linkResults.push({
            sourcePage: page,
            viewport: viewport.name,
            tag: item.tag,
            href: item.href,
            normalized: null,
            status: "broken",
            reason: "empty-or-javascript-href",
          })
          continue
        }

        if (!isInternal(normalized) && !normalized.startsWith("/")) {
          linkResults.push({
            sourcePage: page,
            viewport: viewport.name,
            tag: item.tag,
            href: item.href,
            normalized,
            status: "external",
          })
          continue
        }

        if (normalized.startsWith("mailto:") || normalized.startsWith("tel:")) {
          linkResults.push({
            sourcePage: page,
            viewport: viewport.name,
            tag: item.tag,
            href: item.href,
            normalized,
            status: "external",
          })
          continue
        }

        const internalPath = stripHash(normalized)
        if (!INTERNAL_LINK_ALLOWLIST.has(internalPath) && internalPath !== page && !seenLinks.has(`${page}::${internalPath}`)) {
          seenLinks.add(`${page}::${internalPath}`)
        }

        try {
          const linkResponse = await fetch(new URL(internalPath, BASE_URL), {
            headers: { "user-agent": viewport.userAgent },
            redirect: "manual",
          })
          const location = linkResponse.headers.get("location")
          linkResults.push({
            sourcePage: page,
            viewport: viewport.name,
            tag: item.tag,
            href: item.href,
            normalized: internalPath,
            status: linkResponse.status,
            location,
            redirect: location ? normalizePath(location) : null,
            bodyLeak: false,
          })

          const body = await linkResponse.text()
          if (leakFindings(body).length) {
            leakResults.push({ page: internalPath, viewport: viewport.name, findings: leakFindings(body) })
          }
        } catch (error) {
          linkResults.push({
            sourcePage: page,
            viewport: viewport.name,
            tag: item.tag,
            href: item.href,
            normalized: internalPath,
            status: "error",
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }

    pageResults.push({ page, ...perViewport })
    routeStatus.push({ page, desktop: perViewport.desktop?.status, mobile: perViewport.mobile?.status })
  }

  const apiChecks = {}
  apiChecks.billingCheckout = await checkApi("POST", "/api/billing/checkout", { organizationId: "cmrgmpcd50001iqyo57iirzo6", userId: "cmrgmpccu0000iqyo2p2stz99" })
  apiChecks.billingPortal = await checkApi("POST", "/api/billing/portal", { organizationId: "cmrgmpcd50001iqyo57iirzo6", userId: "cmrgmpccu0000iqyo2p2stz99" })
  apiChecks.webhookGet = await checkApi("GET", "/api/webhooks/stripe")
  apiChecks.webhookUnsigned = await checkApi("POST", "/api/webhooks/stripe", { id: "evt_audit_unsigned", type: "checkout.session.completed", data: { object: {} } })
  apiChecks.offerRequestEmpty = await checkApi("POST", "/api/ethical-agent-farm/offer-request", {})
  apiChecks.offerRequestValid = await checkApi("POST", "/api/ethical-agent-farm/offer-request", {
    name: "AMS Audit Smoke Test",
    email: "test@example.com",
    businessName: "AMS Audit Smoke Test Business",
    websiteOrFacebook: "https://www.aspectmarketingsolutions.app",
    selectedOffer: "quick-marketing-audit",
    notesOrGoals: "production audit smoke test only",
    consent: true,
  })

  const securityChecks = {}
  securityChecks.adminRequestsUnauth = await checkApi("GET", "/admin/ethical-agent-farm-requests")
  securityChecks.reviewerAccessUnauth = await checkApi("GET", "/reviewer-access")
  securityChecks.requestAccessUnauth = await checkApi("GET", "/request-access")

  const brokenPages = pageResults.filter((item) => item.desktop?.status !== 200 || item.mobile?.status !== 200)
  const brokenLinks = linkResults.filter((item) => item.status === "broken" || item.status === "error" || (typeof item.status === "number" && item.status >= 400))
  const redirectLinks = linkResults.filter((item) => typeof item.status === "number" && item.status >= 300 && item.status < 400)
  const localLeaks = leakResults.filter((item) => item.findings.some((f) => ["localhost", "127.0.0.1", "host.docker.internal"].includes(f.toLowerCase())))

  const summary = {
    baseUrl: BASE_URL,
    generatedAt: new Date().toISOString(),
    totalPagesChecked: REQUIRED_PAGES.length * VIEWPORTS.length,
    totalUniquePages: REQUIRED_PAGES.length,
    totalLinksChecked: linkResults.length,
    passingLinks: linkResults.filter((item) => item.status === 200 || item.status === 204 || item.status === 301 || item.status === 302 || item.status === 307 || item.status === 308).length,
    brokenPages: brokenPages.length,
    brokenLinks: brokenLinks.length,
    redirects: redirectLinks.length,
    localhostLeaks: localLeaks.length,
    apiChecks: {
      billingCheckout: { status: apiChecks.billingCheckout.status, ok: apiChecks.billingCheckout.status === 200 },
      billingPortal: { status: apiChecks.billingPortal.status, ok: apiChecks.billingPortal.status === 200 },
      webhookGet: { status: apiChecks.webhookGet.status, ok: apiChecks.webhookGet.status === 200 },
      webhookUnsigned: { status: apiChecks.webhookUnsigned.status, ok: apiChecks.webhookUnsigned.status === 400 },
      offerRequestEmpty: { status: apiChecks.offerRequestEmpty.status, ok: apiChecks.offerRequestEmpty.status === 400 },
      offerRequestValid: { status: apiChecks.offerRequestValid.status, ok: apiChecks.offerRequestValid.status === 201 || apiChecks.offerRequestValid.status === 200 },
    },
    securityChecks: {
      adminRequestsUnauth: securityChecks.adminRequestsUnauth.status,
      reviewerAccessUnauth: securityChecks.reviewerAccessUnauth.status,
      requestAccessUnauth: securityChecks.requestAccessUnauth.status,
    },
  }

  const output = {
    summary,
    pageResults,
    linkResults,
    leakResults,
    apiChecks,
    securityChecks,
  }

  await writeFile(JSON_REPORT_PATH, JSON.stringify(output, null, 2), "utf8")

  const md = []
  md.push("# AMS Production Link Audit")
  md.push("")
  md.push(`**Base URL**: ${BASE_URL}`)
  md.push(`**Generated**: ${summary.generatedAt}`)
  md.push(`**Status**: ${brokenLinks.length === 0 && localLeaks.length === 0 ? "PASS" : "FAIL"}`)
  md.push("")
  md.push("## Summary")
  md.push("")
  md.push(`- Total pages checked: ${summary.totalPagesChecked}`)
  md.push(`- Total unique pages: ${summary.totalUniquePages}`)
  md.push(`- Total links checked: ${summary.totalLinksChecked}`)
  md.push(`- Passing links: ${summary.passingLinks}`)
  md.push(`- Broken pages: ${summary.brokenPages}`)
  md.push(`- Broken links: ${summary.brokenLinks}`)
  md.push(`- Redirects: ${summary.redirects}`)
  md.push(`- Localhost leaks: ${summary.localhostLeaks}`)
  md.push("")
  md.push("## API Checks")
  md.push("")
  for (const [name, check] of Object.entries(summary.apiChecks)) {
    md.push(`- ${name}: ${check.ok ? "PASS" : "FAIL"} (${check.status})`)
  }
  md.push("")
  md.push("## Security Checks")
  md.push("")
  md.push(`- /admin/ethical-agent-farm-requests unauthenticated: ${securityChecks.adminRequestsUnauth.status}${securityChecks.adminRequestsUnauth.location ? ` -> ${securityChecks.adminRequestsUnauth.location}` : ""}`)
  md.push(`- /reviewer-access unauthenticated: ${securityChecks.reviewerAccessUnauth.status}`)
  md.push(`- /request-access unauthenticated: ${securityChecks.requestAccessUnauth.status}`)
  md.push("")
  md.push("## Broken Pages")
  md.push("")
  if (brokenPages.length === 0) {
    md.push("- None found")
  } else {
    for (const item of brokenPages) {
      md.push(`- ${item.page}: desktop ${item.desktop?.status}, mobile ${item.mobile?.status}`)
    }
  }
  md.push("")
  md.push("## Broken Links")
  md.push("")
  if (brokenLinks.length === 0) {
    md.push("- None found")
  } else {
    for (const item of brokenLinks) {
      md.push(`- [${item.sourcePage}] ${item.viewport} ${item.tag} -> ${item.href} (${item.status}${item.error ? ` ${item.error}` : ""})`)
    }
  }
  md.push("")
  md.push("## Localhost / Leak Findings")
  md.push("")
  if (localLeaks.length === 0) {
    md.push("- None found")
  } else {
    for (const item of localLeaks) {
      md.push(`- [${item.page}] ${item.viewport}: ${item.findings.join(", ")}`)
    }
  }
  md.push("")
  md.push("## Recommended Fixes")
  md.push("")
  if (brokenLinks.length === 0 && localLeaks.length === 0) {
    md.push("- No fixes required from the production crawl.")
  } else {
    for (const item of brokenLinks.slice(0, 20)) {
      md.push(`- Fix ${item.sourcePage} (${item.viewport}) link ${item.href} -> ${item.normalized || "invalid"}; status ${item.status}`)
    }
    for (const item of localLeaks.slice(0, 20)) {
      md.push(`- Remove localhost leak from ${item.page} (${item.viewport}): ${item.findings.join(", ")}`)
    }
  }

  await writeFile(MD_REPORT_PATH, md.join("\n"), "utf8")

  console.log(JSON.stringify(summary, null, 2))
  process.exit(brokenLinks.length === 0 && localLeaks.length === 0 ? 0 : 2)
}

main().catch(async (error) => {
  await mkdir(REPORT_DIR, { recursive: true }).catch(() => undefined)
  const payload = {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  }
  await writeFile(JSON_REPORT_PATH, JSON.stringify(payload, null, 2), "utf8").catch(() => undefined)
  await writeFile(MD_REPORT_PATH, `# AMS Production Link Audit\n\n## Error\n\n\`${payload.error}\`\n`, "utf8").catch(() => undefined)
  console.error(error)
  process.exit(1)
})
