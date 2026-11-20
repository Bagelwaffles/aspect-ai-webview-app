import { maintenanceRepository } from "@/lib/server/maintenance-lifecycle"

type Fetcher = typeof fetch

function headers(env: NodeJS.ProcessEnv): HeadersInit {
  const token = env.AMS_MAINTENANCE_GITHUB_READ_TOKEN?.trim()
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "AMS-maintenance-readonly/1",
    ...(token ? { Authorization: "Bearer " + token } : {}),
  }
}

async function readGithub(path: string, env: NodeJS.ProcessEnv, fetcher: Fetcher) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetcher("https://api.github.com/repos/" + maintenanceRepository + path, {
      method: "GET", redirect: "error", cache: "no-store",
      headers: headers(env), signal: controller.signal,
    })
    if (!response.ok) throw new Error("MAINTENANCE_GITHUB_UNAVAILABLE")
    return (await response.json()) as unknown
  } catch {
    throw new Error("MAINTENANCE_GITHUB_UNAVAILABLE")
  } finally {
    clearTimeout(timeout)
  }
}

export async function verifyMaintenanceDraftPr(
  number: number,
  expectedSha: string,
  env: NodeJS.ProcessEnv = process.env,
  fetcher: Fetcher = fetch,
): Promise<string> {
  if (!Number.isSafeInteger(number) || number < 1 || !/^[a-f0-9]{40}$/u.test(expectedSha)) {
    throw new Error("MAINTENANCE_PR_PROOF_INVALID")
  }
  const result = (await readGithub("/pulls/" + number, env, fetcher)) as {
    draft?: boolean
    state?: string
    merged?: boolean
    head?: { sha?: string; repo?: { full_name?: string } }
    base?: { ref?: string }
    html_url?: string
  }
  if (result.state !== "open" || result.draft !== true || result.merged === true ||
      result.head?.sha !== expectedSha ||
      result.head?.repo?.full_name !== maintenanceRepository ||
      result.base?.ref !== "main" ||
      result.html_url !== "https://github.com/" + maintenanceRepository + "/pull/" + number) {
    throw new Error("MAINTENANCE_PR_PROOF_INVALID")
  }
  return result.html_url
}

export async function verifyMaintenanceChecks(
  headSha: string,
  env: NodeJS.ProcessEnv = process.env,
  fetcher: Fetcher = fetch,
): Promise<void> {
  if (!/^[a-f0-9]{40}$/u.test(headSha)) throw new Error("MAINTENANCE_CHECKS_PROOF_INVALID")
  const result = (await readGithub(
    "/actions/runs?head_sha=" + headSha + "&event=pull_request&per_page=100", env, fetcher,
  )) as {
    workflow_runs?: Array<{
      name?: string
      head_sha?: string
      event?: string
      status?: string
      conclusion?: string | null
    }>
  }
  const runs = result.workflow_runs ?? []
  for (const name of ["AMS Reconciliation CI", "Secret scan"]) {
    const matching = runs.filter(
      (run) => run.name === name && run.head_sha === headSha && run.event === "pull_request",
    )
    // The latest attempt of each required workflow must be successful, not merely an older run.
    if (!matching.length || matching[0].status !== "completed" || matching[0].conclusion !== "success") {
      throw new Error("MAINTENANCE_REQUIRED_CHECKS_NOT_PASSED")
    }
  }
}
