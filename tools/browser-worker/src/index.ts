import { createHash } from "node:crypto"
import { lstat, mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import process from "node:process"
import readline from "node:readline/promises"

import { chromium, type BrowserContext, type Page } from "playwright-core"

const VERSION = "1.1.0"
const appRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "AMS", "BrowserWorker")
const credentialsPath = path.join(appRoot, "credentials.json")
const profilePath = path.join(appRoot, "EdgeProfile")
const logRoot = path.join(appRoot, "logs")
const uploadRoot = path.join(appRoot, "Uploads")
const MAX_LOG_BYTES = 1_000_000
const MAX_OLD_LOGS = 5
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024
const SAFE_UPLOAD_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._() -]{0,159}$/
const SAFE_UPLOAD_EXTENSION = /\.(png|jpe?g|webp|gif|pdf|csv|txt|zip|aab|apk)$/i

interface Credentials {
  baseUrl: string
  workerId: string
  token: string
}

interface BrowserJob {
  id: string
  action: "open" | "inspect" | "screenshot" | "click" | "fill" | "upload" | "submit"
  url: string
  selector?: string
  value?: string
  useCurrentPage?: boolean
}

type OwnerAction =
  | "login_required"
  | "mfa_required"
  | "captcha_required"
  | "consent_required"
  | "security_check_required"

class OwnerActionRequired extends Error {
  constructor(public ownerAction: OwnerAction, message: string) {
    super(message)
  }
}

interface BrowserSession {
  context: BrowserContext
  page: Page
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function flag(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "")
}

async function jsonRequest<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const body = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `HTTP_${response.status}`)
  return body as T
}

function redact(value: string) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/(token|secret|password|code|authorization)([\"':=\s]+)[^\"'\s,}]+/gi, "$1$2[redacted]")
    .replace(/sk_(live|test)_[A-Za-z0-9]+/g, "sk_$1_[redacted]")
    .replace(/pk_(live|test)_[A-Za-z0-9]+/g, "pk_$1_[redacted]")
    .replace(/whsec_[A-Za-z0-9]+/g, "whsec_[redacted]")
}

async function rotateLogsIfNeeded() {
  await mkdir(logRoot, { recursive: true })
  const file = path.join(logRoot, "worker.log")
  const info = await stat(file).catch(() => null)
  if (info && info.size >= MAX_LOG_BYTES) {
    await rename(file, path.join(logRoot, `worker-${Date.now()}.log`)).catch(() => undefined)
  }
  const oldLogs = (await readdir(logRoot).catch(() => []))
    .filter((name) => /^worker-\d+\.log$/.test(name))
    .sort()
  for (const name of oldLogs.slice(0, Math.max(0, oldLogs.length - MAX_OLD_LOGS))) {
    await unlink(path.join(logRoot, name)).catch(() => undefined)
  }
}

function log(message: string) {
  console.log(redact(message))
}

function warn(message: string) {
  console.warn(redact(message))
}

function logError(message: string) {
  console.error(redact(message))
}

async function pair() {
  const baseUrl = normalizeBaseUrl(flag("--url") || "https://www.aspectmarketingsolutions.app")
  let code = flag("--code")?.trim()
  if (!code) {
    const terminal = readline.createInterface({ input: process.stdin, output: process.stdout })
    code = (await terminal.question("AMS one-time pairing code: ")).trim()
    terminal.close()
  }
  if (!code) throw new Error("Pairing code is required")

  const paired = await jsonRequest<{ workerId: string; token: string }>(`${baseUrl}/api/browser-control/worker/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      name: os.hostname() ? `AMS Browser Worker · ${os.hostname()}` : "AMS Windows Browser Worker",
      version: VERSION,
      platform: `${os.platform()} ${os.release()} ${os.arch()}`,
      browser: "Microsoft Edge",
    }),
  })

  await mkdir(appRoot, { recursive: true })
  await writeFile(credentialsPath, JSON.stringify({ baseUrl, workerId: paired.workerId, token: paired.token }, null, 2), { mode: 0o600 })
  log(`Paired worker ${paired.workerId}. The worker token was stored locally and was not printed.`)
}

async function credentials(): Promise<Credentials> {
  const raw = await readFile(credentialsPath, "utf8").catch(() => "")
  if (!raw) throw new Error(`Worker is not paired. Run npm run pair first. Missing ${credentialsPath}`)
  const parsed = JSON.parse(raw) as Partial<Credentials>
  if (!parsed.baseUrl || !parsed.workerId || !parsed.token) throw new Error("Invalid worker credentials file")
  return parsed as Credentials
}

function workerHeaders(creds: Credentials) {
  return {
    Authorization: `Bearer ${creds.token}`,
    "x-ams-worker-id": creds.workerId,
    "Content-Type": "application/json",
  }
}

async function launchContext(): Promise<BrowserContext> {
  await Promise.all([
    mkdir(profilePath, { recursive: true }),
    mkdir(uploadRoot, { recursive: true }),
  ])
  const requested = process.env.AMS_BROWSER_CHANNEL?.trim() || "msedge"
  const channels = Array.from(new Set([requested, "msedge", "chrome"]))
  let lastError: unknown

  for (const channel of channels) {
    try {
      log(`Launching dedicated AMS browser profile with channel: ${channel}`)
      return await chromium.launchPersistentContext(profilePath, {
        channel,
        headless: false,
        chromiumSandbox: true,
        viewport: { width: 1440, height: 900 },
        acceptDownloads: false,
      })
    } catch (error) {
      lastError = error
    }
  }

  throw new Error(`Could not launch Microsoft Edge or Chrome with Chromium sandboxing enabled. ${lastError instanceof Error ? lastError.message : "Browser unavailable"}`)
}

async function pageFor(context: BrowserContext): Promise<Page> {
  return context.pages()[0] || await context.newPage()
}

async function newSession(): Promise<BrowserSession> {
  const context = await launchContext()
  const page = await pageFor(context)
  return { context, page }
}

function sessionIsUsable(session: BrowserSession | null) {
  if (!session || session.page.isClosed()) return false
  try {
    return session.context.pages().includes(session.page)
  } catch {
    return false
  }
}

async function ensureSession(session: BrowserSession | null): Promise<BrowserSession> {
  if (sessionIsUsable(session)) return session as BrowserSession
  if (session) await session.context.close().catch(() => undefined)
  warn("AMS browser session was closed. Relaunching the dedicated profile.")
  return newSession()
}

function isReadOnlyAction(action: BrowserJob["action"]) {
  return action === "open" || action === "inspect" || action === "screenshot"
}

function isInteractiveAction(action: BrowserJob["action"]) {
  return action === "click" || action === "fill" || action === "upload" || action === "submit"
}

function isClosedBrowserError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /target page, context or browser has been closed|browser has been closed|page has been closed/i.test(message)
}

async function navigate(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 })
  await page.waitForTimeout(500)
}

function pageOrigin(page: Page): string | null {
  try {
    const current = new URL(page.url())
    if (current.protocol !== "https:") return null
    return current.origin
  } catch {
    return null
  }
}

async function preparePage(page: Page, job: BrowserJob) {
  if (!job.useCurrentPage) {
    await navigate(page, job.url)
    return
  }
  if (!isInteractiveAction(job.action)) throw new Error("useCurrentPage is only allowed for interactive actions")

  const currentOrigin = pageOrigin(page)
  const targetOrigin = new URL(job.url).origin
  if (!currentOrigin || currentOrigin !== targetOrigin) {
    throw new Error(`CURRENT_PAGE_ORIGIN_MISMATCH: expected ${targetOrigin}`)
  }
  await page.waitForTimeout(200)
}

function locatorFor(page: Page, selector: string) {
  const trimmed = selector.trim()
  const match = /^(role|text|label|placeholder|testid)=(.+)$/i.exec(trimmed)
  if (!match) return page.locator(trimmed).first()
  const [, kind, value] = match
  if (kind.toLowerCase() === "role") {
    const roleMatch = /^([^:]+):(.+)$/.exec(value)
    if (roleMatch) return page.getByRole(roleMatch[1] as never, { name: roleMatch[2] }).first()
    return page.getByRole(value as never).first()
  }
  if (kind.toLowerCase() === "text") return page.getByText(value).first()
  if (kind.toLowerCase() === "label") return page.getByLabel(value).first()
  if (kind.toLowerCase() === "placeholder") return page.getByPlaceholder(value).first()
  return page.getByTestId(value).first()
}

function safeUploadPath(fileName: string) {
  const trimmed = fileName.trim()
  if (!SAFE_UPLOAD_FILENAME.test(trimmed) || !SAFE_UPLOAD_EXTENSION.test(trimmed) || trimmed.includes("..")) {
    throw new Error("UPLOAD_FILENAME_NOT_ALLOWED")
  }
  if (path.basename(trimmed) !== trimmed) throw new Error("UPLOAD_PATH_NOT_ALLOWED")
  return path.join(uploadRoot, trimmed)
}

async function uploadFile(page: Page, selector: string, fileName: string) {
  const filePath = safeUploadPath(fileName)
  const info = await lstat(filePath).catch(() => null)
  if (!info || !info.isFile() || info.isSymbolicLink()) {
    throw new Error(`UPLOAD_FILE_NOT_FOUND: ${fileName}`)
  }
  if (info.size > MAX_UPLOAD_BYTES) throw new Error("UPLOAD_FILE_TOO_LARGE")
  await locatorFor(page, selector).setInputFiles(filePath, { timeout: 15_000 })
  await page.waitForTimeout(500)
}

async function detectOwnerAction(page: Page): Promise<OwnerAction | null> {
  const text = (await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "")).toLowerCase()
  const url = page.url().toLowerCase()
  if (/captcha|recaptcha|i'm not a robot|verify you are human/.test(text)) return "captcha_required"
  if (/two-factor|two factor|2fa|mfa|verification code|authenticator|security code|approve this sign-in/.test(text)) return "mfa_required"
  if (/consent|authorize app|allow access|permissions requested/.test(text)) return "consent_required"
  if (/suspicious|security check|verify your identity|unusual activity/.test(text)) return "security_check_required"
  if (/login|log in|sign in|signin|accounts.google.com|checkpoint/.test(url) || /sign in|log in|login required/.test(text)) return "login_required"
  return null
}

async function execute(page: Page, job: BrowserJob) {
  const started = Date.now()
  await preparePage(page, job)
  const ownerAction = await detectOwnerAction(page)
  if (ownerAction) throw new OwnerActionRequired(ownerAction, `Owner action required: ${ownerAction}`)

  let text: string | undefined
  let captureBase64: string | undefined
  let captureSha256: string | undefined

  if (job.action === "inspect") {
    text = (await page.locator("body").innerText({ timeout: 10_000 })).slice(0, 20_000)
  }

  if (job.action === "screenshot") {
    const capture = await page.screenshot({ type: "png", fullPage: true })
    const captureBuffer = Buffer.from(capture)
    captureSha256 = createHash("sha256").update(captureBuffer).digest("hex")
    if (captureBuffer.byteLength <= 620_000) captureBase64 = captureBuffer.toString("base64")
  }

  if (job.action === "click" || job.action === "submit") {
    if (!job.selector) throw new Error(`${job.action} requires a selector`)
    await locatorFor(page, job.selector).click({ timeout: 15_000 })
    await page.waitForTimeout(800)
  }

  if (job.action === "fill") {
    if (!job.selector || job.value === undefined) throw new Error("fill requires selector and value")
    await locatorFor(page, job.selector).fill(job.value, { timeout: 15_000 })
  }

  if (job.action === "upload") {
    if (!job.selector || !job.value) throw new Error("upload requires selector and filename")
    await uploadFile(page, job.selector, job.value)
  }

  const finalOwnerAction = await detectOwnerAction(page)
  if (finalOwnerAction) throw new OwnerActionRequired(finalOwnerAction, `Owner action required: ${finalOwnerAction}`)

  return {
    title: (await page.title()).slice(0, 500),
    finalUrl: page.url(),
    text,
    captureBase64,
    captureSha256,
    durationMs: Date.now() - started,
  }
}

async function run() {
  const creds = await credentials()
  await rotateLogsIfNeeded()
  let session: BrowserSession | null = await newSession()
  let currentJobId: string | null = null
  let lastHeartbeat = 0

  log("AMS Browser Worker started. Close this process or use the AMS emergency stop to prevent new jobs.")
  log(`Dedicated profile: ${profilePath}`)
  log(`Approved local upload folder: ${uploadRoot}`)

  process.on("SIGINT", async () => {
    if (session) await session.context.close().catch(() => undefined)
    process.exit(0)
  })

  while (true) {
    try {
      if (Date.now() - lastHeartbeat >= 15_000) {
        const heartbeat = await jsonRequest<{ disabled: boolean }>(`${creds.baseUrl}/api/browser-control/worker/heartbeat`, {
          method: "POST",
          headers: workerHeaders(creds),
          body: JSON.stringify({
            version: VERSION,
            platform: `${os.platform()} ${os.release()} ${os.arch()}`,
            browser: "Microsoft Edge / Chromium",
            currentJobId,
          }),
        })
        lastHeartbeat = Date.now()
        if (heartbeat.disabled) {
          await sleep(4_000)
          continue
        }
      }

      const claimed = await jsonRequest<{ disabled: boolean; job: BrowserJob | null }>(`${creds.baseUrl}/api/browser-control/worker/claim`, {
        method: "POST",
        headers: workerHeaders(creds),
        body: "{}",
      })
      if (claimed.disabled || !claimed.job) {
        await sleep(2_500)
        continue
      }

      const job = claimed.job
      currentJobId = job.id
      log(`[${job.id}] ${job.action} ${job.url}${job.useCurrentPage ? " · current-page" : ""}`)
      const started = Date.now()
      try {
        session = await ensureSession(session)
        let result
        try {
          result = await execute(session.page, job)
        } catch (error) {
          if (!isReadOnlyAction(job.action) || !isClosedBrowserError(error)) throw error
          warn(`[${job.id}] Browser closed during read-only job. Relaunching and retrying once.`)
          await session.context.close().catch(() => undefined)
          session = await newSession()
          result = await execute(session.page, job)
        }

        await jsonRequest(`${creds.baseUrl}/api/browser-control/worker/result`, {
          method: "POST",
          headers: workerHeaders(creds),
          body: JSON.stringify({ jobId: job.id, ok: true, ...result }),
        })
        log(`[${job.id}] PASS · ${result.title}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const finalUrl = session && !session.page.isClosed() ? session.page.url() : undefined
        if (isClosedBrowserError(error)) {
          if (session) await session.context.close().catch(() => undefined)
          session = null
        }
        await jsonRequest(`${creds.baseUrl}/api/browser-control/worker/result`, {
          method: "POST",
          headers: workerHeaders(creds),
          body: JSON.stringify({
            jobId: job.id,
            ok: false,
            error: message,
            ownerAction: error instanceof OwnerActionRequired ? error.ownerAction : undefined,
            durationMs: Date.now() - started,
            finalUrl,
          }),
        }).catch(() => undefined)
        logError(`[${job.id}] FAIL · ${message}`)
      } finally {
        currentJobId = null
        lastHeartbeat = 0
      }
    } catch (error) {
      logError(`Worker loop: ${error instanceof Error ? error.message : String(error)}`)
      await sleep(5_000)
    }
  }
}

const command = process.argv[2]
if (command === "pair") await pair()
else if (command === "run") await run()
else {
  console.error("Usage: npm run pair -- --url https://www.aspectmarketingsolutions.app --code AMS-XXXX-XXXX-XXXX | npm start")
  process.exitCode = 1
}
