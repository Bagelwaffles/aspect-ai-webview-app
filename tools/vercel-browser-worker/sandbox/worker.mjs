import { createHash } from "node:crypto"
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"

import { chromium } from "playwright"

const VERSION = "0.1.0"
const ROOT = "/vercel/sandbox/ams-browser"
const CREDENTIALS_PATH = path.join(ROOT, "credentials.json")
const PROFILE_PATH = path.join(ROOT, "ChromiumProfile")
const UPLOAD_ROOT = path.join(ROOT, "Uploads")
const LAST_URL_PATH = path.join(ROOT, "last-url.txt")
const DAEMON_PID_PATH = path.join(ROOT, "daemon.pid")
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024
const SAFE_UPLOAD_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._() -]{0,159}$/
const SAFE_UPLOAD_EXTENSION = /\.(png|jpe?g|webp|gif|pdf|csv|txt|zip|aab|apk)$/iu

const PROVIDER_SUFFIXES = [
  "aspectmarketingsolutions.app",
  "github.com",
  "vercel.com",
  "upstash.com",
  "linkedin.com",
  "microsoft.com",
  "facebook.com",
  "instagram.com",
  "pinterest.com",
  "reddit.com",
  "tiktok.com",
  "x.com",
  "twitter.com",
  "x.ai",
  "google.com",
  "youtube.com",
  "youtu.be",
  "twitch.tv",
  "streamlabs.com",
  "fiverr.com",
  "stripe.com",
  "shopify.com",
  "printify.com",
  "etsy.com",
  "namecheap.com",
  "slack.com",
  "telegram.org",
  "pipedream.com",
  "relevanceai.com",
  "n8n.cloud",
  "canva.com",
  "heygen.com",
  "openai.com",
  "chatgpt.com",
  "anthropic.com",
  "claude.ai",
  "v0.app",
  "v0.dev",
  "manus.im",
  "manus.ai",
  "manus.space",
]

const AMS_VERCEL_PATTERNS = [
  /^aspect-ai-overlord(?:-[a-z0-9-]+)?\.vercel\.app$/u,
  /^v0-aspect-ai-v0-handoff20250830(?:-[a-z0-9-]+)?\.vercel\.app$/u,
]

class OwnerActionRequired extends Error {
  constructor(ownerAction, message) {
    super(message)
    this.ownerAction = ownerAction
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function safeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl)
    if (url.username || url.password || url.protocol !== "https:") return null
    const hostname = url.hostname.toLowerCase().replace(/\.$/u, "")
    const provider = PROVIDER_SUFFIXES.some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
    )
    const ownedVercel = AMS_VERCEL_PATTERNS.some((pattern) => pattern.test(hostname))
    return provider || ownedVercel ? url : null
  } catch {
    return null
  }
}

function redact(value) {
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/giu, "Bearer [redacted]")
    .replace(/(token|secret|password|authorization)(["':=\s]+)[^"'\s,}]+/giu, "$1$2[redacted]")
}

function workerHeaders(credentials) {
  return {
    Authorization: `Bearer ${credentials.token}`,
    "x-ams-worker-id": credentials.workerId,
    "Content-Type": "application/json",
  }
}

async function jsonRequest(url, init) {
  const response = await fetch(url, init)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const code = typeof body?.error === "string"
      ? body.error
      : typeof body?.code === "string"
        ? body.code
        : `HTTP_${response.status}`
    throw new Error(code)
  }
  return body
}

async function saveCredentials(credentials) {
  await mkdir(ROOT, { recursive: true })
  const temp = `${CREDENTIALS_PATH}.tmp`
  await writeFile(temp, JSON.stringify(credentials), { encoding: "utf8", mode: 0o600 })
  await rename(temp, CREDENTIALS_PATH)
}

async function credentials() {
  const raw = await readFile(CREDENTIALS_PATH, "utf8").catch(() => "")
  if (!raw) throw new Error("CLOUD_BROWSER_NOT_PAIRED")
  const parsed = JSON.parse(raw)
  if (!parsed.baseUrl || !parsed.workerId || !parsed.token) {
    throw new Error("CLOUD_BROWSER_CREDENTIALS_INVALID")
  }
  return parsed
}

async function pair() {
  const baseUrl = process.env.AMS_BASE_URL?.trim().replace(/\/+$/u, "")
  const code = process.env.AMS_PAIR_CODE?.trim()
  if (!baseUrl || !safeUrl(baseUrl) || !code || code.length > 80) {
    throw new Error("CLOUD_BROWSER_PAIR_INPUT_INVALID")
  }

  const paired = await jsonRequest(`${baseUrl}/api/browser-control/worker/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      name: "AMS Vercel Cloud Browser Worker",
      version: VERSION,
      platform: "Vercel Sandbox",
      browser: "Chromium headless",
    }),
  })
  if (!paired.workerId || !paired.token) throw new Error("CLOUD_BROWSER_PAIR_RESPONSE_INVALID")
  await saveCredentials({
    baseUrl,
    workerId: paired.workerId,
    token: paired.token,
  })
  process.stdout.write(JSON.stringify({ ok: true, workerId: paired.workerId }))
}

async function status() {
  const raw = await readFile(CREDENTIALS_PATH, "utf8").catch(() => "")
  const profile = await stat(PROFILE_PATH).catch(() => null)
  process.stdout.write(JSON.stringify({
    ok: true,
    paired: Boolean(raw),
    profilePresent: Boolean(profile?.isDirectory()),
    version: VERSION,
  }))
}

async function launchContext() {
  await Promise.all([
    mkdir(PROFILE_PATH, { recursive: true }),
    mkdir(UPLOAD_ROOT, { recursive: true }),
  ])
  return chromium.launchPersistentContext(PROFILE_PATH, {
    headless: true,
    chromiumSandbox: true,
    viewport: { width: 1440, height: 900 },
    acceptDownloads: false,
    args: ["--disable-dev-shm-usage"],
  })
}

async function pageFor(context) {
  return context.pages()[0] || await context.newPage()
}

function locatorFor(page, selector) {
  const trimmed = selector.trim()
  const match = /^(role|text|label|placeholder|testid)=(.+)$/iu.exec(trimmed)
  if (!match) return page.locator(trimmed).first()
  const [, kind, value] = match
  switch (kind.toLowerCase()) {
    case "role": {
      const roleMatch = /^([^:]+):(.+)$/u.exec(value)
      return roleMatch
        ? page.getByRole(roleMatch[1], { name: roleMatch[2] }).first()
        : page.getByRole(value).first()
    }
    case "text":
      return page.getByText(value).first()
    case "label":
      return page.getByLabel(value).first()
    case "placeholder":
      return page.getByPlaceholder(value).first()
    default:
      return page.getByTestId(value).first()
  }
}

async function describePage(page) {
  const result = await page.evaluate(() => {
    const clean = (value) => (value || "").replace(/\s+/g, " ").trim().slice(0, 160)
    const labelFor = (element) => {
      if (!(element instanceof HTMLElement)) return ""
      const aria = clean(element.getAttribute("aria-label"))
      if (aria) return aria
      if (element.id) {
        const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`)
        const labelText = clean(label?.textContent)
        if (labelText) return labelText
      }
      return clean(element.closest("label")?.textContent)
    }
    const headings = Array.from(document.querySelectorAll("h1,h2,h3"))
      .slice(0, 30)
      .map((element) => clean(element.textContent))
      .filter(Boolean)
    const controls = Array.from(
      document.querySelectorAll("input,textarea,select,button,a,[role='button']"),
    ).slice(0, 200).map((element) => {
      const input = element instanceof HTMLInputElement ? element : null
      return {
        tag: element.tagName.toLowerCase(),
        type: input?.type || undefined,
        name: clean(element.getAttribute("name")) || undefined,
        id: clean(element.id) || undefined,
        label: labelFor(element) || undefined,
        placeholder: clean(element.getAttribute("placeholder")) || undefined,
        role: clean(element.getAttribute("role")) || undefined,
        text: input || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
          ? undefined
          : clean(element.textContent) || undefined,
        href: element instanceof HTMLAnchorElement
          ? clean(element.getAttribute("href")) || undefined
          : undefined,
        disabled: "disabled" in element ? Boolean(element.disabled) : undefined,
      }
    })
    return { headings, controls }
  })
  return JSON.stringify(result).slice(0, 20_000)
}

async function detectOwnerAction(page) {
  const text = (await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "")).toLowerCase()
  const url = page.url().toLowerCase()
  if (/captcha|recaptcha|i'm not a robot|verify you are human/u.test(text)) return "captcha_required"
  if (/two-factor|two factor|2fa|mfa|verification code|authenticator|security code|approve this sign-in/u.test(text)) {
    return "mfa_required"
  }
  if (/consent|authorize app|allow access|permissions requested/u.test(text)) return "consent_required"
  if (/suspicious|security check|verify your identity|unusual activity/u.test(text)) return "security_check_required"
  if (/login|log in|sign in|signin|accounts\.google\.com|checkpoint/u.test(url) || /sign in|log in|login required/u.test(text)) {
    return "login_required"
  }
  return null
}

async function preparePage(page, job) {
  const target = safeUrl(job.url)
  if (!target) throw new Error("CLOUD_BROWSER_URL_NOT_ALLOWED")

  if (!job.useCurrentPage) {
    await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 30_000 })
    await page.waitForTimeout(500)
    return
  }

  const current = safeUrl(page.url())
  if (current?.origin === target.origin) {
    await page.waitForTimeout(200)
    return
  }

  const lastUrlRaw = await readFile(LAST_URL_PATH, "utf8").catch(() => "")
  const lastUrl = safeUrl(lastUrlRaw.trim())
  if (lastUrl?.origin !== target.origin) {
    throw new Error(`CURRENT_PAGE_ORIGIN_MISMATCH: expected ${target.origin}`)
  }

  await page.goto(lastUrl.href, { waitUntil: "domcontentloaded", timeout: 30_000 })
  await page.waitForTimeout(500)
}

function safeUploadPath(fileName) {
  const trimmed = fileName.trim()
  if (
    !SAFE_UPLOAD_FILENAME.test(trimmed) ||
    !SAFE_UPLOAD_EXTENSION.test(trimmed) ||
    trimmed.includes("..") ||
    path.basename(trimmed) !== trimmed
  ) {
    throw new Error("UPLOAD_FILENAME_NOT_ALLOWED")
  }
  return path.join(UPLOAD_ROOT, trimmed)
}

async function uploadFile(page, selector, fileName) {
  const filePath = safeUploadPath(fileName)
  const info = await stat(filePath).catch(() => null)
  if (!info?.isFile() || info.size > MAX_UPLOAD_BYTES) throw new Error("CLOUD_UPLOAD_FILE_NOT_STAGED")
  await locatorFor(page, selector).setInputFiles(filePath, { timeout: 15_000 })
}

async function execute(page, job) {
  const started = Date.now()
  if (!safeUrl(job.url)) throw new Error("CLOUD_BROWSER_URL_NOT_ALLOWED")

  if (job.action === "capture_secret" || job.action === "fill_secret") {
    throw new Error("CLOUD_SECRET_VAULT_NOT_ENABLED")
  }

  if (job.action === "focus_browser") {
    await page.bringToFront()
    return {
      title: (await page.title()).slice(0, 500),
      finalUrl: page.url(),
      text: "Cloud browser is active in Vercel Sandbox.",
      durationMs: Date.now() - started,
    }
  }

  await preparePage(page, job)
  const ownerAction = await detectOwnerAction(page)
  if (ownerAction) {
    throw new OwnerActionRequired(ownerAction, `Owner action required: ${ownerAction}`)
  }

  let text
  let captureBase64
  let captureSha256

  if (job.action === "describe") {
    text = await describePage(page)
  } else if (job.action === "inspect") {
    text = (await page.locator("body").innerText({ timeout: 10_000 })).slice(0, 20_000)
  } else if (job.action === "screenshot") {
    const capture = Buffer.from(await page.screenshot({ type: "png", fullPage: true }))
    captureSha256 = createHash("sha256").update(capture).digest("hex")
    if (capture.byteLength <= 620_000) captureBase64 = capture.toString("base64")
  } else if (job.action === "click" || job.action === "submit") {
    if (!job.selector) throw new Error(`${job.action} requires a selector`)
    await locatorFor(page, job.selector).click({ timeout: 15_000 })
    await page.waitForTimeout(800)
  } else if (job.action === "fill") {
    if (!job.selector || job.value === undefined) throw new Error("fill requires selector and value")
    await locatorFor(page, job.selector).fill(job.value, { timeout: 15_000 })
  } else if (job.action === "upload") {
    if (!job.selector || !job.value) throw new Error("upload requires selector and filename")
    await uploadFile(page, job.selector, job.value)
  } else if (job.action !== "open") {
    throw new Error("CLOUD_BROWSER_ACTION_UNSUPPORTED")
  }

  const finalOwnerAction = await detectOwnerAction(page)
  if (finalOwnerAction) {
    throw new OwnerActionRequired(finalOwnerAction, `Owner action required: ${finalOwnerAction}`)
  }

  const finalUrl = page.url()
  if (safeUrl(finalUrl)) await writeFile(LAST_URL_PATH, finalUrl, "utf8").catch(() => undefined)

  return {
    title: (await page.title()).slice(0, 500),
    finalUrl,
    text,
    captureBase64,
    captureSha256,
    durationMs: Date.now() - started,
  }
}

async function report(credentialsValue, body) {
  return jsonRequest(`${credentialsValue.baseUrl}/api/browser-control/worker/result`, {
    method: "POST",
    headers: workerHeaders(credentialsValue),
    body: JSON.stringify(body),
  })
}

async function heartbeat(credentialsValue, currentJobId) {
  return jsonRequest(`${credentialsValue.baseUrl}/api/browser-control/worker/heartbeat`, {
    method: "POST",
    headers: workerHeaders(credentialsValue),
    body: JSON.stringify({
      version: VERSION,
      platform: "Vercel Sandbox",
      browser: "Chromium headless",
      currentJobId,
    }),
  })
}

async function claim(credentialsValue) {
  return jsonRequest(`${credentialsValue.baseUrl}/api/browser-control/worker/claim`, {
    method: "POST",
    headers: workerHeaders(credentialsValue),
    body: "{}",
  })
}

function closedBrowserError(error) {
  const message = error instanceof Error ? error.message : String(error)
  return /target page, context or browser has been closed|browser has been closed|page has been closed/iu.test(message)
}

async function daemon() {
  const creds = await credentials()
  let context = null
  let page = null
  let currentJobId = null
  let lastHeartbeat = 0

  const ensurePage = async () => {
    if (context && page && !page.isClosed()) return page
    if (context) await context.close().catch(() => undefined)
    context = await launchContext()
    page = await pageFor(context)
    return page
  }

  const cleanPid = async () => {
    await writeFile(DAEMON_PID_PATH, "", "utf8").catch(() => undefined)
  }
  process.on("SIGTERM", () => { void cleanPid(); process.exit(0) })
  process.on("SIGINT", () => { void cleanPid(); process.exit(0) })

  while (true) {
    try {
      if (Date.now() - lastHeartbeat >= 15_000) {
        const state = await heartbeat(creds, currentJobId)
        lastHeartbeat = Date.now()
        if (state.disabled) {
          await sleep(4_000)
          continue
        }
      }

      const claimed = await claim(creds)
      if (claimed.disabled || !claimed.job) {
        await sleep(2_500)
        continue
      }

      const job = claimed.job
      currentJobId = job.id
      const started = Date.now()

      try {
        const activePage = await ensurePage()
        let result
        try {
          result = await execute(activePage, job)
        } catch (error) {
          if (!closedBrowserError(error)) throw error
          if (context) await context.close().catch(() => undefined)
          context = null
          page = null
          result = await execute(await ensurePage(), job)
        }

        await report(creds, { jobId: job.id, ok: true, ...result })
      } catch (error) {
        const message = redact(error instanceof Error ? error.message : String(error)).slice(0, 2_000)
        const finalUrl = page && !page.isClosed() ? page.url() : undefined
        await report(creds, {
          jobId: job.id,
          ok: false,
          error: message,
          ownerAction: error instanceof OwnerActionRequired ? error.ownerAction : undefined,
          durationMs: Date.now() - started,
          finalUrl,
        }).catch(() => undefined)
      } finally {
        currentJobId = null
      }
    } catch (error) {
      console.error(redact(error instanceof Error ? error.message : String(error)).slice(0, 500))
      await sleep(5_000)
    }
  }
}

async function main() {
  const mode = process.argv[2]
  if (mode === "pair") return pair()
  if (mode === "status") return status()
  if (mode === "daemon") return daemon()
  throw new Error("CLOUD_BROWSER_MODE_INVALID")
}

main().catch((error) => {
  console.error(redact(error instanceof Error ? error.message : String(error)).slice(0, 500))
  process.exit(1)
})
