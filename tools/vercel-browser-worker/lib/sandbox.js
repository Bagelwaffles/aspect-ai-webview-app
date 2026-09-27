import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { Sandbox } from "@vercel/sandbox"

const ROOT = "/vercel/sandbox/ams-browser"
const WORKER_PATH = `${ROOT}/worker.mjs`
const SANDBOX_PACKAGE_PATH = `${ROOT}/package.json`
const DAEMON_PID_PATH = `${ROOT}/daemon.pid`
const DAEMON_LOG_PATH = `${ROOT}/daemon.log`
const DEFAULT_SANDBOX_NAME = "ams-browser-worker"
const SESSION_TIMEOUT_MS = 10 * 60 * 1000

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

function sandboxName(env = process.env) {
  const value = env.AMS_CLOUD_BROWSER_SANDBOX_NAME?.trim()
  if (!value) return DEFAULT_SANDBOX_NAME
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u.test(value)) {
    throw new Error("CLOUD_BROWSER_SANDBOX_NAME_INVALID")
  }
  return value
}

function sourcePath() {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.join(here, "..", "sandbox", "worker.mjs")
}

async function workerSource() {
  return readFile(sourcePath())
}

async function writeRuntimeFiles(sandbox) {
  const source = await workerSource()
  await sandbox.runCommand("mkdir", ["-p", ROOT])
  await sandbox.writeFiles([
    {
      path: WORKER_PATH,
      content: source,
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

async function installBrowserRuntime(sandbox) {
  await writeRuntimeFiles(sandbox)
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
    args: ["playwright", "install", "--with-deps", "chromium"],
    cwd: ROOT,
  })
  if (result.exitCode !== 0) {
    throw new Error(`CLOUD_BROWSER_CHROMIUM_INSTALL_FAILED:${result.exitCode}`)
  }
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
      await writeRuntimeFiles(sbx)
    },
  })

  await writeRuntimeFiles(sandbox)
  await sandbox.updateNetworkPolicy({
    allow: NETWORK_ALLOWLIST,
  })
  return sandbox
}

export async function startCloudBrowserDaemon(sandbox) {
  const command = [
    "set -euo pipefail",
    `mkdir -p ${ROOT}`,
    `if [ -s ${DAEMON_PID_PATH} ] && kill -0 "$(cat ${DAEMON_PID_PATH})" 2>/dev/null; then echo "already-running"; exit 0; fi`,
    `nohup node ${WORKER_PATH} daemon >> ${DAEMON_LOG_PATH} 2>&1 &`,
    `echo $! > ${DAEMON_PID_PATH}`,
    "echo started",
  ].join("; ")

  const result = await sandbox.runCommand({
    cmd: "bash",
    args: ["-lc", command],
    cwd: ROOT,
  })
  if (result.exitCode !== 0) {
    throw new Error(`CLOUD_BROWSER_DAEMON_START_FAILED:${result.exitCode}`)
  }
  return (await result.stdout()).trim()
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
  return { ...parsed, daemon: daemon.exitCode === 0 }
}

export async function stopCloudBrowserSandbox(sandbox) {
  await sandbox.stop()
}
