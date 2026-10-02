import { spawn } from "node:child_process"
import { createHash, timingSafeEqual } from "node:crypto"
import { closeSync, openSync } from "node:fs"
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import http from "node:http"
import path from "node:path"
import process from "node:process"

import { chromium } from "playwright"

const ROOT = "/vercel/sandbox/ams-browser"
const PROFILE_PATH = path.join(ROOT, "ChromiumProfile")
const WORKER_PATH = path.join(ROOT, "worker.mjs")
const DAEMON_PID_PATH = path.join(ROOT, "daemon.pid")
const DAEMON_LOG_PATH = path.join(ROOT, "daemon.log")
const REMOTE_LOGIN_PID_PATH = path.join(ROOT, "remote-login.pid")
const PLAYWRIGHT_BROWSERS_PATH = path.join(ROOT, "ms-playwright")
const VIEWPORT = { width: 1440, height: 900 }
const MAX_BODY_BYTES = 8 * 1024

const PROVIDER_SUFFIXES = [
  "aspectmarketingsolutions.app",
  "github.com",
  "vercel.com",
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

function requiredEnvironment() {
  const token = process.env.AMS_REMOTE_LOGIN_TOKEN?.trim()
  const target = safeUrl(process.env.AMS_REMOTE_LOGIN_URL?.trim() || "https://accounts.google.com/")
  const expiresAt = Number(process.env.AMS_REMOTE_LOGIN_EXPIRES_AT)
  const port = Number(process.env.AMS_REMOTE_LOGIN_PORT || "6080")
  if (!token || token.length < 32 || !target || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error("CLOUD_LOGIN_SESSION_INPUT_INVALID")
  }
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("CLOUD_LOGIN_SESSION_PORT_INVALID")
  }
  return { token, target, expiresAt, port }
}

function hash(value) {
  return createHash("sha256").update(value, "utf8").digest()
}

function bearerAuthorized(request, expectedToken) {
  const raw = typeof request.headers.authorization === "string"
    ? request.headers.authorization.trim()
    : ""
  if (!raw.startsWith("Bearer ")) return false
  return timingSafeEqual(hash(raw.slice(7)), hash(expectedToken))
}

function securityHeaders(response, contentType) {
  response.setHeader("Cache-Control", "no-store, max-age=0")
  response.setHeader("Content-Type", contentType)
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin")
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin")
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")
  response.setHeader("Referrer-Policy", "no-referrer")
  response.setHeader("X-Content-Type-Options", "nosniff")
  response.setHeader("X-Frame-Options", "DENY")
}

function html() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>AMS Secure Cloud Login</title>
<style>
:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#050711;color:#e2e8f0}
*{box-sizing:border-box}body{margin:0;padding:12px;background:#050711}
main{max-width:1500px;margin:0 auto;display:grid;gap:10px}
.panel{border:1px solid #1e293b;border-radius:16px;background:#020617;padding:12px}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
button,input{font:inherit;border-radius:10px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;padding:10px 12px}
button{font-weight:800;cursor:pointer}button.primary{background:#67e8f9;color:#082f49;border-color:#67e8f9}
button.danger{border-color:#fb7185;color:#fecdd3}input.url{flex:1;min-width:220px}
#screenWrap{overflow:auto;touch-action:pan-x pan-y;background:#000;border-radius:12px;min-height:240px}
#screen{display:block;width:100%;height:auto;cursor:crosshair;user-select:none;-webkit-user-drag:none}
#secureText{flex:1;min-width:180px}
.small{font-size:12px;color:#94a3b8;line-height:1.4}.status{font-size:13px;color:#a5f3fc;word-break:break-word}
.keys button{min-width:62px}
</style>
</head>
<body>
<main>
<section class="panel">
  <div class="row">
    <strong>AMS Secure Cloud Login</strong>
    <span id="status" class="status">Connecting…</span>
  </div>
  <p class="small">Provider credentials go directly from this browser to the isolated Vercel Sandbox over TLS. They are not sent through AMS chat, Redis, or Browser Control jobs. This console expires automatically.</p>
</section>
<section class="panel">
  <div class="row">
    <input id="url" class="url" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://accounts.google.com/">
    <button id="go">Go</button>
    <button id="reload">Reload</button>
    <button id="close" class="danger">Close secure session</button>
  </div>
</section>
<section id="screenWrap" class="panel"><img id="screen" alt="Live cloud browser"></section>
<section class="panel">
  <div class="row">
    <input id="secureText" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Secure typing: enter text, then Send">
    <button id="sendText" class="primary">Send typed text</button>
  </div>
  <p class="small">Tap the remote page first to focus a field. Typed text is cleared from this control immediately after sending.</p>
  <div class="row keys">
    <button data-key="Tab">Tab</button><button data-key="Enter">Enter</button><button data-key="Backspace">Backspace</button>
    <button data-key="Escape">Esc</button><button data-key="ArrowLeft">←</button><button data-key="ArrowRight">→</button>
    <button data-key="ArrowUp">↑</button><button data-key="ArrowDown">↓</button>
    <button data-scroll="-650">Scroll up</button><button data-scroll="650">Scroll down</button>
  </div>
</section>
</main>
<script src="/app.js"></script>
</body>
</html>`
}

function appJs() {
  return String.raw`
(() => {
  const params = new URLSearchParams(location.hash.slice(1));
  const token = params.get("token") || "";
  history.replaceState(null, "", location.pathname);
  const status = document.getElementById("status");
  const screen = document.getElementById("screen");
  const urlInput = document.getElementById("url");
  const secureText = document.getElementById("secureText");
  let frameUrl = "";
  let stopped = false;

  const headers = (json = false) => ({
    Authorization: "Bearer " + token,
    ...(json ? {"Content-Type": "application/json"} : {})
  });

  async function send(payload) {
    if (!token || stopped) return false;
    const response = await fetch("/input", {
      method: "POST",
      headers: headers(true),
      cache: "no-store",
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      status.textContent = response.status === 401 ? "Session authorization failed." : "Input failed (" + response.status + ")";
      return false;
    }
    return true;
  }

  async function refreshState() {
    if (!token || stopped) return;
    try {
      const response = await fetch("/state", {headers: headers(), cache: "no-store"});
      if (!response.ok) throw new Error(String(response.status));
      const body = await response.json();
      status.textContent = body.title ? body.title + " — " + body.url : body.url;
      if (document.activeElement !== urlInput) urlInput.value = body.url || "";
    } catch {
      status.textContent = "Secure session unavailable.";
    }
  }

  async function refreshFrame() {
    if (!token || stopped) return;
    try {
      const response = await fetch("/frame", {headers: headers(), cache: "no-store"});
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      const next = URL.createObjectURL(blob);
      screen.onload = () => {
        if (frameUrl) URL.revokeObjectURL(frameUrl);
        frameUrl = next;
      };
      screen.src = next;
    } catch {
      status.textContent = "Waiting for cloud browser…";
    } finally {
      if (!stopped) setTimeout(refreshFrame, 900);
    }
  }

  screen.addEventListener("click", async (event) => {
    if (!screen.naturalWidth || !screen.naturalHeight) return;
    const rect = screen.getBoundingClientRect();
    const x = Math.round((event.clientX - rect.left) * screen.naturalWidth / rect.width);
    const y = Math.round((event.clientY - rect.top) * screen.naturalHeight / rect.height);
    await send({type: "click", x, y});
  });

  document.getElementById("sendText").addEventListener("click", async () => {
    const value = secureText.value;
    secureText.value = "";
    if (value) await send({type: "text", value});
    secureText.focus();
  });

  secureText.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      document.getElementById("sendText").click();
    }
  });

  document.querySelectorAll("[data-key]").forEach((button) => {
    button.addEventListener("click", () => send({type: "key", key: button.dataset.key}));
  });

  document.querySelectorAll("[data-scroll]").forEach((button) => {
    button.addEventListener("click", () => send({type: "scroll", dy: Number(button.dataset.scroll)}));
  });

  document.getElementById("go").addEventListener("click", () => send({type: "navigate", url: urlInput.value}));
  document.getElementById("reload").addEventListener("click", () => send({type: "reload"}));
  document.getElementById("close").addEventListener("click", async () => {
    stopped = true;
    await fetch("/close", {method: "POST", headers: headers(), cache: "no-store"}).catch(() => undefined);
    status.textContent = "Secure session closed. Browser worker is restarting.";
    screen.removeAttribute("src");
  });

  if (!token) {
    status.textContent = "Missing secure session token.";
    stopped = true;
    return;
  }
  refreshState();
  refreshFrame();
  setInterval(refreshState, 2000);
})();`
}

async function readJson(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error("REQUEST_TOO_LARGE")
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")
}

async function pidAlive(rawPid) {
  const pid = Number(String(rawPid || "").trim())
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function restartDaemon() {
  const existing = await readFile(DAEMON_PID_PATH, "utf8").catch(() => "")
  if (await pidAlive(existing)) return
  const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH }
  delete env.AMS_REMOTE_LOGIN_TOKEN
  delete env.AMS_REMOTE_LOGIN_URL
  delete env.AMS_REMOTE_LOGIN_EXPIRES_AT
  delete env.AMS_REMOTE_LOGIN_PORT
  const logFd = openSync(DAEMON_LOG_PATH, "a")
  try {
    const child = spawn(process.execPath, [WORKER_PATH, "daemon"], {
      cwd: ROOT,
      detached: true,
      env,
      stdio: ["ignore", logFd, logFd],
    })
    child.unref()
    await writeFile(DAEMON_PID_PATH, String(child.pid), "utf8")
  } finally {
    closeSync(logFd)
  }
}

async function main() {
  const { token, target, expiresAt, port } = requiredEnvironment()
  await mkdir(PROFILE_PATH, { recursive: true })

  const context = await chromium.launchPersistentContext(PROFILE_PATH, {
    headless: true,
    chromiumSandbox: true,
    viewport: VIEWPORT,
    acceptDownloads: false,
    args: ["--disable-dev-shm-usage"],
  })
  const page = context.pages()[0] || await context.newPage()
  await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined)

  let cleaning = false
  let server

  async function shutdown({ restartWorker }) {
    if (cleaning) return
    cleaning = true
    if (server) {
      await new Promise((resolve) => server.close(() => resolve()))
    }
    await context.close().catch(() => undefined)
    await unlink(REMOTE_LOGIN_PID_PATH).catch(() => undefined)
    if (restartWorker) await restartDaemon().catch(() => undefined)
  }

  server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "https://sandbox.invalid")
      if (request.method === "GET" && url.pathname === "/") {
        securityHeaders(response, "text/html; charset=utf-8")
        response.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self' blob:; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'")
        response.end(html())
        return
      }
      if (request.method === "GET" && url.pathname === "/app.js") {
        securityHeaders(response, "application/javascript; charset=utf-8")
        response.setHeader("Content-Security-Policy", "default-src 'none'")
        response.end(appJs())
        return
      }

      if (!bearerAuthorized(request, token) || Date.now() >= expiresAt) {
        securityHeaders(response, "application/json; charset=utf-8")
        response.statusCode = 401
        response.end(JSON.stringify({ ok: false, code: "REMOTE_LOGIN_UNAUTHORIZED" }))
        return
      }

      if (request.method === "GET" && url.pathname === "/state") {
        const current = safeUrl(page.url())
        const display = current ? `${current.origin}${current.pathname}` : "about:blank"
        const title = (await page.title().catch(() => "")).slice(0, 160)
        securityHeaders(response, "application/json; charset=utf-8")
        response.end(JSON.stringify({ ok: true, title, url: display }))
        return
      }

      if (request.method === "GET" && url.pathname === "/frame") {
        const frame = await page.screenshot({ type: "jpeg", quality: 62, fullPage: false })
        securityHeaders(response, "image/jpeg")
        response.end(frame)
        return
      }

      if (request.method === "POST" && url.pathname === "/input") {
        const body = await readJson(request)
        if (body.type === "click") {
          const x = Math.max(0, Math.min(VIEWPORT.width, Number(body.x)))
          const y = Math.max(0, Math.min(VIEWPORT.height, Number(body.y)))
          if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("INVALID_CLICK")
          await page.mouse.click(x, y)
        } else if (body.type === "text") {
          const value = typeof body.value === "string" ? body.value.slice(0, 1024) : ""
          if (!value) throw new Error("INVALID_TEXT")
          await page.keyboard.insertText(value)
        } else if (body.type === "key") {
          const allowed = new Set(["Tab", "Enter", "Backspace", "Escape", "Delete", "Home", "End", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"])
          if (!allowed.has(body.key)) throw new Error("INVALID_KEY")
          await page.keyboard.press(body.key)
        } else if (body.type === "scroll") {
          const dy = Math.max(-1200, Math.min(1200, Number(body.dy)))
          if (!Number.isFinite(dy)) throw new Error("INVALID_SCROLL")
          await page.mouse.wheel(0, dy)
        } else if (body.type === "reload") {
          await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined)
        } else if (body.type === "navigate") {
          const next = safeUrl(typeof body.url === "string" ? body.url : "")
          if (!next) throw new Error("REMOTE_LOGIN_URL_NOT_ALLOWED")
          await page.goto(next.href, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined)
        } else {
          throw new Error("INVALID_INPUT")
        }
        securityHeaders(response, "application/json; charset=utf-8")
        response.end(JSON.stringify({ ok: true }))
        return
      }

      if (request.method === "POST" && url.pathname === "/close") {
        securityHeaders(response, "application/json; charset=utf-8")
        response.end(JSON.stringify({ ok: true }))
        setTimeout(() => void shutdown({ restartWorker: true }).then(() => process.exit(0)), 50)
        return
      }

      securityHeaders(response, "application/json; charset=utf-8")
      response.statusCode = 404
      response.end(JSON.stringify({ ok: false, code: "NOT_FOUND" }))
    } catch {
      securityHeaders(response, "application/json; charset=utf-8")
      response.statusCode = 400
      response.end(JSON.stringify({ ok: false, code: "REMOTE_LOGIN_REQUEST_FAILED" }))
    }
  })

  server.listen(port, "0.0.0.0")

  const expiryDelay = Math.max(0, expiresAt - Date.now())
  const expiryTimer = setTimeout(() => void shutdown({ restartWorker: true }).then(() => process.exit(0)), expiryDelay)
  expiryTimer.unref()

  process.on("SIGTERM", () => void shutdown({ restartWorker: false }).then(() => process.exit(0)))
  process.on("SIGINT", () => void shutdown({ restartWorker: false }).then(() => process.exit(0)))
  process.on("uncaughtException", () => void shutdown({ restartWorker: true }).then(() => process.exit(1)))
  process.on("unhandledRejection", () => void shutdown({ restartWorker: true }).then(() => process.exit(1)))
}

main().catch(async () => {
  await unlink(REMOTE_LOGIN_PID_PATH).catch(() => undefined)
  await restartDaemon().catch(() => undefined)
  process.exit(1)
})
