import { normalizeMaintenanceInput, recordMaintenanceFinding } from "@/lib/server/maintenance-lifecycle"
import type { MaintenanceFinding, MaintenanceOptions } from "@/lib/server/maintenance-lifecycle"

const REPOSITORY = "Bagelwaffles/aspect-ai-webview-app"
const ENDPOINT = "https://api.github.com/repos/" + REPOSITORY + "/actions/runs?branch=main&per_page=30"
const MAX_WINDOW_MS = 24 * 60 * 60 * 1000
const WATCHED = new Map([
  ["Secret scan", "github-security"],
  ["Twitch Short Render Worker", "github-operations"],
  ["Twitch VOD Catch-up Worker", "github-operations"],
])

type Run = {
  id?: unknown
  name?: unknown
  status?: unknown
  conclusion?: unknown
  head_branch?: unknown
  head_sha?: unknown
  html_url?: unknown
  event?: unknown
  created_at?: unknown
  run_attempt?: unknown
}

function normalizedFailure(run: Run, now: Date): MaintenanceFinding | null {
  if (typeof run.name !== "string" || !WATCHED.has(run.name) ||
      run.status !== "completed" ||
      (run.conclusion !== "failure" && run.conclusion !== "timed_out") ||
      run.head_branch !== "main" ||
      (run.event !== "push" && run.event !== "schedule") ||
      typeof run.id !== "number" || !Number.isSafeInteger(run.id) || run.id < 1 ||
      typeof run.head_sha !== "string" || !/^[0-9a-f]{40}$/u.test(run.head_sha) ||
      typeof run.html_url !== "string" ||
      run.html_url !== "https://github.com/" + REPOSITORY + "/actions/runs/" + run.id ||
      typeof run.created_at !== "string") {
    return null
  }
  const at = Date.parse(run.created_at)
  if (!Number.isFinite(at) || at > now.getTime() + 5 * 60_000 ||
      now.getTime() - at > MAX_WINDOW_MS) return null
  const attempt = run.run_attempt === undefined ? 1 : run.run_attempt
  if (typeof attempt !== "number" || !Number.isSafeInteger(attempt) || attempt < 1 || attempt > 100) {
    return null
  }
  const area = WATCHED.get(run.name)!
  const severity = run.name === "Secret scan" ? "critical" : "warning"
  // Source names and descriptions are fixed allowlist values, never arbitrary issue/commit text.
  return normalizeMaintenanceInput({
    origin: "backend",
    category: "repair",
    area,
    summary: run.name + " " + run.conclusion + " on main; review the run to identify code, provider, or infrastructure causes.",
    sourceFingerprint: "github-run:" + run.id + ":attempt:" + attempt,
    sourceObservedAt: new Date(at).toISOString(),
    severity,
    evidenceUrl: run.html_url,
    estimatedCostUsd: null,
    businessImpact: "Investigate independently before a repair proposal; do not rerun payments or published media.",
  }, now)
}

export function filterGithubActionFailures(payload: unknown, now = new Date()): MaintenanceFinding[] {
  if (!payload || typeof payload !== "object") throw new Error("MAINTENANCE_GITHUB_PAYLOAD_INVALID")
  const runs = (payload as { workflow_runs?: unknown }).workflow_runs
  if (!Array.isArray(runs) || runs.length > 100) throw new Error("MAINTENANCE_GITHUB_PAYLOAD_INVALID")
  const findings: MaintenanceFinding[] = []
  for (const run of runs) {
    if (!run || typeof run !== "object" || Array.isArray(run)) continue
    const finding = normalizedFailure(run as Run, now)
    if (finding) findings.push(finding)
  }
  return findings
}

export async function ingestGithubActionFailures(
  options: MaintenanceOptions & { fetcher?: typeof fetch } = {},
): Promise<{ seen: number; ingested: number; duplicates: number }> {
  const now = options.now ?? new Date()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  const token = (options.env ?? process.env).AMS_MAINTENANCE_GITHUB_READ_TOKEN?.trim()
  let payload: unknown
  try {
    const response = await (options.fetcher ?? fetch)(ENDPOINT, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "AMS-maintenance-readonly/1",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      redirect: "error", cache: "no-store", signal: controller.signal,
    })
    if (!response.ok) throw new Error("MAINTENANCE_GITHUB_UNAVAILABLE")
    const maxBodyBytes = 500_000
    const body = await response.text()
    if (body.length > maxBodyBytes) throw new Error("MAINTENANCE_GITHUB_PAYLOAD_INVALID")
    try {
      payload = JSON.parse(body)
    } catch {
      throw new Error("MAINTENANCE_GITHUB_PAYLOAD_INVALID")
    }
  } catch {
    throw new Error("MAINTENANCE_GITHUB_UNAVAILABLE")
  } finally {
    clearTimeout(timeout)
  }
  const findings = filterGithubActionFailures(payload, now)
  let ingested = 0
  let duplicates = 0
  for (const finding of findings) {
    // Redis errors propagate. No notification claims success from in-memory observation.
    const result = await recordMaintenanceFinding(finding, options)
    if (result.new) ingested++
    else duplicates++
  }
  return { seen: findings.length, ingested, duplicates }
}
