import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import process from "node:process"
import readline from "node:readline/promises"

import { chromium, type BrowserContext, type Page } from "playwright-core"

const VERSION = "1.0.0"
const appRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "AMS", "BrowserWorker")
const credentialsPath = path.join(appRoot, "credentials.json")
const profilePath = path.join(appRoot, "EdgeProfile")

interface Credentials {
  baseUrl: string
  workerId: string
  token: string
}

interface BrowserJob {
  id: string
  action: "open" | "inspect" | "screenshot" | "click" | "fill" | "submit"
  url: string
  selector?: string
  value?: string
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
  console.log(`Paired worker ${paired.workerId}. The worker token was stored locally and was not printed.`)
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
  await mkdir(profilePath, { recursive: true })
  const requested = process.env.AMS_BROWSER_CHANNEL?.trim() || "msedge"
  const channels = Array.from(new Set([requested, "msedge", "chrome"]))
  let lastError: unknown

  for (const channel of channels) {
    try {
      console.log(`Launching dedicated AMS browser profile with channel: ${channel}`)
      return await chromium.launchPersistentContext(profilePath, {
        channel,
        headless: false,
        viewport: { width: 1440, height: 900 },
        acceptDownloads: false,
      })
    } catch (error) {
      lastError = error
    }
  }

  throw new Error(`Could not launch Microsoft Edge or Chrome. ${lastError instanceof Error ? lastError.message : "Browser unavailable"}`)
}

async function pageFor(context: BrowserContext): Promise<Page> {
  return context.pages()[0] || await context.newPage()
}

async function navigate(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 })
  await page.waitForTimeout(500)
}

async function execute(page: Page, job: BrowserJob) {
  const started = Date.now()
  await navigate(page, job.url)

  let text: string | undefined
  let captureBase64: string | undefined
  let captureSha256: string | undefined

  if (job.action === "inspect") {
    text = (await page.locator("body").innerText({ timeout: 10_000 })).slice(0, 20_000)
  }

  if (job.action === "screenshot") {
    const capture = await page.screenshot({ type: "png", fullPage: true })
    captureSha256 = createHash("sha256").update(capture).digest("hex")
    if (capture.byteLength <= 620_000) captureBase64 = capture.toString("base64")
  }

  if (job.action === "click" || job.action === "submit") {
    if (!job.selector) throw new Error(`${job.action} requires a selector`)
    await page.locator(job.selector).first().click({ timeout: 15_000 })
    await page.waitForTimeout(800)
  }

  if (job.action === "fill") {
    if (!job.selector || job.value === undefined) throw new Error("fill requires selector and value")
    await page.locator(job.selector).first().fill(job.value, { timeout: 15_000 })
  }

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
  const context = await launchContext()
  const page = await pageFor(context)
  let currentJobId: string | null = null
  let lastHeartbeat = 0

  console.log("AMS Browser Worker started. Close this process or use the AMS emergency stop to prevent new jobs.")
  console.log(`Dedicated profile: ${profilePath}`)

  process.on("SIGINT", async () => {
    await context.close().catch(() => undefined)
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
      console.log(`[${job.id}] ${job.action} ${job.url}`)
      const started = Date.now()
      try {
        const result = await execute(page, job)
        await jsonRequest(`${creds.baseUrl}/api/browser-control/worker/result`, {
          method: "POST",
          headers: workerHeaders(creds),
          body: JSON.stringify({ jobId: job.id, ok: true, ...result }),
        })
        console.log(`[${job.id}] PASS · ${result.title}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await jsonRequest(`${creds.baseUrl}/api/browser-control/worker/result`, {
          method: "POST",
          headers: workerHeaders(creds),
          body: JSON.stringify({ jobId: job.id, ok: false, error: message, durationMs: Date.now() - started, finalUrl: page.url() }),
        }).catch(() => undefined)
        console.error(`[${job.id}] FAIL · ${message}`)
      } finally {
        currentJobId = null
        lastHeartbeat = 0
      }
    } catch (error) {
      console.error(`Worker loop: ${error instanceof Error ? error.message : String(error)}`)
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
