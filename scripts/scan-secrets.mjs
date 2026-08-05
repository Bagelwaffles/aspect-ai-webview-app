import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { extname } from "node:path"

const BINARY_EXTENSIONS = new Set([
  ".7z",
  ".aab",
  ".apk",
  ".avif",
  ".bin",
  ".bmp",
  ".class",
  ".db",
  ".dll",
  ".doc",
  ".docx",
  ".eot",
  ".exe",
  ".gif",
  ".gz",
  ".ico",
  ".jar",
  ".jpeg",
  ".jpg",
  ".lock",
  ".mov",
  ".mp3",
  ".mp4",
  ".otf",
  ".pdf",
  ".png",
  ".sqlite",
  ".tar",
  ".tgz",
  ".ttf",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".xls",
  ".xlsx",
  ".zip",
])

const SKIP_PATHS = new Set([
  "scripts/scan-secrets.mjs",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
])

const DETECTORS = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/u],
  ["AWS access key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/u],
  ["GitHub token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,255}\b/u],
  ["GitHub fine-grained token", /\bgithub_pat_[A-Za-z0-9_]{40,255}\b/u],
  ["OpenAI-style secret", /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b/u],
  ["Stripe secret key", /\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b/u],
  ["Stripe webhook secret", /\bwhsec_[A-Za-z0-9]{20,}\b/u],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/u],
  ["Slack token", /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/u],
  ["SendGrid key", /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{20,}\b/u],
]

const SENSITIVE_NAME =
  /(?:^|_)(?:API_?KEY|ACCESS_?TOKEN|AUTH_?TOKEN|CLIENT_?SECRET|ENCRYPTION_?KEY|INTERNAL_?KEY|PASSWORD|PRIVATE_?KEY|SECRET|TOKEN)(?:$|_)/iu
const SAFE_VALUE =
  /(?:^$|replace|placeholder|example|dummy|fake|mock|fixture|test|ci-only|not-for-production|invalid|unused|redacted|your[-_ ]|change[-_ ]?me|<[^>]+>)/iu
const ASSIGNMENT_PATTERNS = [
  /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*["']?([^"'\s#]+)["']?\s*(?:#.*)?$/u,
  /^\s*([A-Z][A-Z0-9_]*)\s*:\s*["']?([^"'\s#]+)["']?\s*(?:#.*)?$/u,
  /^\s*["']([A-Z][A-Z0-9_]*)["']\s*:\s*["']([^"']+)["']/u,
]

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
}

function isTextCandidate(path) {
  if (SKIP_PATHS.has(path)) return false
  return !BINARY_EXTENSIONS.has(extname(path).toLowerCase())
}

function lineNumber(content, index) {
  return content.slice(0, index).split("\n").length
}

const findings = []

for (const path of trackedFiles()) {
  if (!isTextCandidate(path)) continue

  let content
  try {
    content = readFileSync(path, "utf8")
  } catch {
    continue
  }

  if (content.includes("\u0000")) continue

  for (const [name, regex] of DETECTORS) {
    const match = regex.exec(content)
    if (match) {
      findings.push({ path, line: lineNumber(content, match.index), detector: name })
    }
  }

  for (const [index, line] of content.split(/\r?\n/u).entries()) {
    for (const pattern of ASSIGNMENT_PATTERNS) {
      const match = pattern.exec(line)
      if (!match) continue

      const [, variable, rawValue] = match
      const value = rawValue.trim()
      if (!SENSITIVE_NAME.test(variable)) break
      if (value.length < 16 || SAFE_VALUE.test(value)) break

      findings.push({
        path,
        line: index + 1,
        detector: `sensitive assignment: ${variable}`,
      })
      break
    }
  }
}

if (findings.length > 0) {
  console.error("Potential committed secrets detected. Values are intentionally not printed.")
  for (const finding of findings) {
    console.error(`- ${finding.path}:${finding.line} (${finding.detector})`)
  }
  process.exit(1)
}

console.log("Tracked-file secret scan passed; no credential values were printed.")
