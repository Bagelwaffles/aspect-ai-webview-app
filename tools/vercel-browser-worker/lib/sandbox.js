import { randomBytes } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { Sandbox } from "@vercel/sandbox"

const ROOT = "/vercel/sandbox/ams-browser"
const WORKER_PATH = `${ROOT}/worker.mjs`
const REMOTE_LOGIN_PATH = `${ROOT}/remote-login.mjs`
const REMOTE_LOGIN_PID_PATH = `${ROOT}/remote-login.pid`
const SANDBOX_PACKAGE_PATH = `${ROOT}/package.json`
const DAEMON_PID_PATH = `${ROOT}/daemon.pid`
const DAEMON_LOG_PATH = `${ROOT}/daemon.log`
const PLAYWRIGHT_BROWSERS_PATH = `${ROOT}/ms-playwright`
const BROWSER_RUNTIME_MARKER_PATH = `${ROOT}/.browser-runtime-1.62.1-v2`
const DEFAULT_SANDBOX_NAME = "ams-browser-worker"
const SESSION_TIMEOUT_MS = 45 * 60 * 1000
const PROFILE_SNAPSHOT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000
const PROFILE_SNAPSHOT_RETENTION_DAYS = 90
const REMOTE_LOGIN_PORT = 6080
const REMOTE_LOGIN_TTL_MS = 10 * 60 * 1000

const NETWORK_ALLOWLIST = [
  "aspectmarketingsolutions.app",
  "*.aspectmarketingsolutions.app",
  "github.com",
  "*.github.com",
  "vercel.com",
  "*.vercel.com",
  "*.vercel.app",
  "upstash.com",
  "*.upstash.com",
  "linkedin.com",
  "*.linkedin.com",
  "*.licdn.com",
  "microsoft.com",
  "*.microsoft.com",
  "facebook.com",
  "*.facebook.com",
  "*.fbcdn.net",
  "instagram.com",
  "*.instagram.com",
  "pinterest.com",
  "*.pinterest.com",
  "*.pinimg.com",
  "reddit.com",
  "*.reddit.com",
  "*.redditstatic.com",
  "tiktok.com",
  "*.tiktok.com",
  "*.tiktokcdn.com",
  "x.com",
  "*.x.com",
  "twitter.com",
  "*.twitter.com",
  "*.twimg.com",
  "x.ai",
  "*.x.ai",
  "google.com",
  "*.google.com",
  "googleapis.com",
  "*.googleapis.com",
  "*.gstatic.com",
  "youtube.com",
  "*.youtube.com",
  "youtu.be",
  "*.ytimg.com",
  "twitch.tv",
  "*.twitch.tv",
  "*.twitchcdn.net",
  "*.ttvnw.net",
  "*.cloudfront.net",
  "streamlabs.com",
  "*.streamlabs.com",
  "fiverr.com",
  "*.fiverr.com",
  "stripe.com",
  "*.stripe.com",
  "shopify.com",
  "*.shopify.com",
  "*.shopifycdn.com",
  "printify.com",
  "*.printify.com",
  "etsy.com",
  "*.etsy.com",
  "namecheap.com",
  "*.namecheap.com",
  "slack.com",
  "*.slack.com",
  "telegram.org",
  "*.telegram.org",
  "pipedream.com",
  "*.pipedream.com",
  "relevanceai.com",
  "*.relevanceai.com",
  "n8n.cloud",
  "*.n8n.cloud",
  "canva.com",
  "*.canva.com",
  "heygen.com",
  "*.heygen.com",
  "openai.com",
  "*.openai.com",
  "chatgpt.com",
  "*.chatgpt.com",
  "anthropic.com",
  "*.anthropic.com",
  "claude.ai",
  "*.claude.ai",
  "v0.app",
  "*.v0.app",
  "v0.dev",
  "*.v0.dev",
  "manus.im",
  "*.manus.im",
  "manus.ai",
  "*.manus.ai",
  "manus.space",
  "*.manus.space"
]

const REMOTE_LOGIN_PROVIDER_SUFFIXES = [
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

const INSTALL_NETWORK_ALLOWLIST = [
  "registry.npmjs.org",
  "cdn.playwright.dev",
  "playwright.download.prss.microsoft.com",
  "cdn.amazonlinux.com",
  "*.amazonaws.com",
]

const CHROMIUM_SYSTEM_DEPS = [
  "nss", "nspr", "libxkbcommon", "atk", "at-spi2-atk", "at-spi2-core",
  "libXcomposite", "libXdamage", "libXrandr", "libXfixes", "libXcursor",
  "libXi", "libXtst", "libXScrnSaver", "libXext", "mesa-libgbm", "libdrm",
  "mesa-libGL", "mesa-libEGL", "cups-libs", "alsa-lib", "pango", "cairo",
  "gtk3", "dbus-libs",
]

function sandboxName(env = process.env) {
  const value = env.AMS_CLOUD_BROWSER_SANDBOX_NAME?.trim()
  if (!value) return DEFAULT_SANDBOX_NAME
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u.test(value)) {
    throw new Error("CLOUD_BROWSER_SANDBOX_NAME_INVALID")
  }
  return value
}

function sourcePath(fileName) {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.join(here, "..", "sandbox", fileName)
}

async function workerSource() {
  return readFile(sourcePath("worker.mjs"))
}

async function remoteLoginSource() {
  return readFile(sourcePath("remote-login.mjs"))
}

function safeRemoteLoginUrl(rawUrl) {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== "https:" || url.username || url.password) return null
    const hostname = url.hostname.toLowerCase().replace(/\.$/u, "")
    const provider = REMOTE_LOGIN_PROVIDER_SUFFIXES.some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
    )
    const ownedVercel =
      /^aspect-ai-overlord(?:-[a-z0-9-]+)?\.vercel\.app$/u.test(hostname) ||
      /^v0-aspect-ai-v0-handoff20250830(?:-[a-z0-9-]+)?\.vercel\.app$/u.test(hostname)
    return provider || ownedVercel ? url : null
  } catch {
    return null
  }
}

async function writeRuntimeFiles(sandbox) {
  const [source, loginSource] = await Promise.all([workerSource(), remoteLoginSource()])
  await sandbox.runCommand("mkdir", ["-p", ROOT])
  await sandbox.writeFiles([
    {
      path: WORKER_PATH,
      content: source,
    },
    {
      path: REMOTE_LOGIN_PATH,
      content: loginSource,
    },
    {
      path: SANDBOX_PACKAGE_PATH,
      content: Buffer.from(JSON.stringify({
        private: true,
        type: "module",
        dependencies: {
          playwright: "1.62.1",
        },
      }, null, 2)),
    },
  ])
}

async function installBrowserRuntime(sandbox, { repair = false } = {}) {
  if (repair) {
    await sandbox.updateNetworkPolicy({
      allow: [...NETWORK_ALLOWLIST, ...INSTALL_NETWORK_ALLOWLIST],
    })
  }

  try {
    await writeRuntimeFiles(sandbox)
    if (repair) {
      const systemDeps = await sandbox.runCommand({
        cmd: "bash",
        args: ["-lc", `sudo dnf clean all >/dev/null && sudo dnf install -y --skip-broken ${CHROMIUM_SYSTEM_DEPS.join(" ")} >/dev/null && sudo ldconfig`],
        cwd: ROOT,
      })
      if (systemDeps.exitCode !== 0) {
        throw new Error(`CLOUD_BROWSER_SYSTEM_DEPS_INSTALL_FAILED:${systemDeps.exitCode}`)
      }
    }

    let result = await sandbox.runCommand({
      cmd: "npm",
      args: ["install", "--omit=dev", "--no-audit", "--no-fund"],
      cwd: ROOT,
    })
    if (result.exitCode !== 0) {
      throw new Error(`CLOUD_BROWSER_NPM_INSTALL_FAILED:${result.exitCode}`)
    }

    result = await sandbox.runCommand({
      cmd: "npx",
      args: repair
        ? ["playwright", "install", "chromium"]
        : ["playwright", "install", "--with-deps", "chromium"],
      cwd: ROOT,
      env: { PLAYWRIGHT_BROWSERS_PATH },
    })
    if (result.exitCode !== 0) {
      throw new Error(`CLOUD_BROWSER_CHROMIUM_INSTALL_FAILED:${result.exitCode}`)
    }

    result = await sandbox.runCommand({
      cmd: "bash",
      args: ["-lc", `if [ -s ${DAEMON_PID_PATH} ]; then kill "$(cat ${DAEMON_PID_PATH})" 2>/dev/null || true; fi; rm -f ${DAEMON_PID_PATH}`],
      cwd: ROOT,
    })
    if (result.exitCode !== 0) {
      throw new Error(`CLOUD_BROWSER_DAEMON_RESET_FAILED:${result.exitCode}`)
    }

    result = await sandbox.runCommand("touch", [BROWSER_RUNTIME_MARKER_PATH])
    if (result.exitCode !== 0) {
      throw new Error(`CLOUD_BROWSER_RUNTIME_MARKER_FAILED:${result.exitCode}`)
    }
  } finally {
    if (repair) {
      await sandbox.updateNetworkPolicy({ allow: NETWORK_ALLOWLIST })
    }
  }
}

async function ensureBrowserRuntime(sandbox) {
  await writeRuntimeFiles(sandbox)
  const marker = await sandbox.runCommand("test", ["-f", BROWSER_RUNTIME_MARKER_PATH])
  if (marker.exitCode !== 0) await installBrowserRuntime(sandbox, { repair: true })
}

export async function getCloudBrowserSandbox(env = process.env) {
  const sandbox = await Sandbox.getOrCreate({
    name: sandboxName(env),
    runtime: "node22",
    timeout: SESSION_TIMEOUT_MS,
    resources: { vcpus: 1 },
    onCreate: async (sbx) => {
      await installBrowserRuntime(sbx)
    },
    onResume: async (sbx) => {
      await ensureBrowserRuntime(sbx)
    },
  })

  await ensureBrowserRuntime(sandbox)
  await sandbox.update({
    snapshotExpiration: PROFILE_SNAPSHOT_RETENTION_MS,
    ports: [REMOTE_LOGIN_PORT],
  })
  await sandbox.updateNetworkPolicy({
    allow: NETWORK_ALLOWLIST,
  })
  return sandbox
}

async function processFromPidFileRunning(sandbox, pidPath) {
  const result = await sandbox.runCommand({
    cmd: "bash",
    args: ["-lc", `[ -s ${pidPath} ] && kill -0 "$(cat ${pidPath})" 2>/dev/null`],
    cwd: ROOT,
  })
  return result.exitCode === 0
}

async function stopProcessFromPidFile(sandbox, pidPath) {
  const command = [
    "set -euo pipefail",
    `if [ -s ${pidPath} ]; then`,
    `  pid="$(cat ${pidPath})"`,
    '  kill "$pid" 2>/dev/null || true',
    '  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done',
    '  if kill -0 "$pid" 2>/dev/null; then kill -KILL "$pid" 2>/dev/null || true; fi',
    'fi',
    `rm -f ${pidPath}`,
  ].join("\n")
  const result = await sandbox.runCommand({
    cmd: "bash",
    args: ["-lc", command],
    cwd: ROOT,
  })
  if (result.exitCode !== 0) throw new Error("CLOUD_BROWSER_PROCESS_STOP_FAILED")
}

export async function startCloudBrowserDaemon(sandbox) {
  if (await processFromPidFileRunning(sandbox, REMOTE_LOGIN_PID_PATH)) {
    throw new Error("CLOUD_LOGIN_SESSION_ACTIVE")
  }
  const command = [
    "set -euo pipefail",
    `mkdir -p ${ROOT}`,
    `if [ -s ${DAEMON_PID_PATH} ] && kill -0 "$(cat ${DAEMON_PID_PATH})" 2>/dev/null; then echo "already-running"; exit 0; fi`,
    `nohup node ${WORKER_PATH} daemon >> ${DAEMON_LOG_PATH} 2>&1 &`,
    `echo $! > ${DAEMON_PID_PATH}`,
    "echo started",
  ].join("\n")

  const result = await sandbox.runCommand({
    cmd: "bash",
    args: ["-lc", command],
    cwd: ROOT,
    env: { PLAYWRIGHT_BROWSERS_PATH },
  })
  if (result.exitCode !== 0) {
    throw new Error(`CLOUD_BROWSER_DAEMON_START_FAILED:${result.exitCode}`)
  }
  return (await result.stdout()).trim()
}

export async function startCloudBrowserLoginSession(sandbox, input = {}) {
  const target = safeRemoteLoginUrl(
    typeof input.targetUrl === "string" && input.targetUrl.trim()
      ? input.targetUrl.trim()
      : "https://accounts.google.com/",
  )
  if (!target) throw new Error("CLOUD_LOGIN_URL_NOT_ALLOWED")

  await stopProcessFromPidFile(sandbox, REMOTE_LOGIN_PID_PATH)
  await stopProcessFromPidFile(sandbox, DAEMON_PID_PATH)

  const token = randomBytes(32).toString("base64url")
  const expiresAt = Date.now() + REMOTE_LOGIN_TTL_MS
  const command = [
    "set -euo pipefail",
    `nohup node ${REMOTE_LOGIN_PATH} >/dev/null 2>&1 &`,
    `echo $! > ${REMOTE_LOGIN_PID_PATH}`,
    `pid="$(cat ${REMOTE_LOGIN_PID_PATH})"`,
    'for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$pid" 2>/dev/null && exit 0; sleep 0.2; done',
    'exit 1',
  ].join("\n")

  const result = await sandbox.runCommand({
    cmd: "bash",
    args: ["-lc", command],
    cwd: ROOT,
    env: {
      PLAYWRIGHT_BROWSERS_PATH,
      AMS_REMOTE_LOGIN_TOKEN: token,
      AMS_REMOTE_LOGIN_URL: target.href,
      AMS_REMOTE_LOGIN_EXPIRES_AT: String(expiresAt),
      AMS_REMOTE_LOGIN_PORT: String(REMOTE_LOGIN_PORT),
    },
  })
  if (result.exitCode !== 0) {
    await startCloudBrowserDaemon(sandbox).catch(() => undefined)
    throw new Error("CLOUD_LOGIN_SESSION_START_FAILED")
  }

  const origin = String(sandbox.domain(REMOTE_LOGIN_PORT)).replace(/\/+$/u, "")
  return {
    launchUrl: `${origin}/#token=${encodeURIComponent(token)}`,
    expiresInSeconds: Math.floor(REMOTE_LOGIN_TTL_MS / 1000),
  }
}

export async function pairCloudBrowserSandbox(sandbox, input) {
  const baseUrl = input.baseUrl.trim().replace(/\/+$/u, "")
  const result = await sandbox.runCommand({
    cmd: "node",
    args: [WORKER_PATH, "pair"],
    cwd: ROOT,
    env: {
      AMS_BASE_URL: baseUrl,
      AMS_PAIR_CODE: input.code,
    },
  })
  const stdout = (await result.stdout()).trim()
  const stderr = (await result.stderr()).trim()
  if (result.exitCode !== 0) {
    throw new Error(stderr.slice(0, 300) || `CLOUD_BROWSER_PAIR_FAILED:${result.exitCode}`)
  }
  return JSON.parse(stdout || "{}")
}

export async function cloudBrowserSandboxStatus(sandbox) {
  const result = await sandbox.runCommand({
    cmd: "node",
    args: [WORKER_PATH, "status"],
    cwd: ROOT,
  })
  if (result.exitCode !== 0) {
    return { paired: false, daemon: false, error: "CLOUD_BROWSER_STATUS_FAILED" }
  }
  const parsed = JSON.parse((await result.stdout()).trim() || "{}")
  const daemon = await sandbox.runCommand({
    cmd: "bash",
    args: ["-lc", `[ -s ${DAEMON_PID_PATH} ] && kill -0 "$(cat ${DAEMON_PID_PATH})" 2>/dev/null`],
    cwd: ROOT,
  })
  const remoteLoginActive = await processFromPidFileRunning(sandbox, REMOTE_LOGIN_PID_PATH)
  return {
    ...parsed,
    daemon: daemon.exitCode === 0,
    remoteLoginActive,
    profileRetentionDays: PROFILE_SNAPSHOT_RETENTION_DAYS,
  }
}

export async function stopCloudBrowserSandbox(sandbox) {
  await sandbox.stop()
}
