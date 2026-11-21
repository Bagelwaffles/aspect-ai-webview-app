import test from "node:test"
import assert from "node:assert/strict"
import { generateKeyPairSync, sign } from "node:crypto"
import { authorizeScheduledWorker, validScheduledWorkerClaims } from "../lib/server/scheduled-task-worker-auth"
const seconds = Math.floor(Date.now() / 1000)
const claims = { iss: "https://token.actions.githubusercontent.com", aud: "ams-scheduled-tasks", sub: "repo:Bagelwaffles/aspect-ai-webview-app:environment:production", repository: "Bagelwaffles/aspect-ai-webview-app", repository_id: "1026496028", ref: "refs/heads/main", workflow_ref: "Bagelwaffles/aspect-ai-webview-app/.github/workflows/scheduled-tasks-worker.yml@refs/heads/main", event_name: "schedule", environment: "production", runner_environment: "github-hosted", iat: seconds, nbf: seconds - 1, exp: seconds + 300 }
test("scheduler claims reject fork, preview, different workflow, audience, repository or stale token", () => {
  assert.equal(validScheduledWorkerClaims(claims), true)
  for (const altered of [{ repository: "other/repo" }, { repository_id: "1" }, { aud: "ams-twitch-worker" }, { ref: "refs/heads/feature" }, { workflow_ref: "unreviewed-workflow" }, { event_name: "pull_request" }, { environment: "preview" }, { runner_environment: "self-hosted" }, { exp: seconds - 1 }, { iat: seconds - 1000 }]) assert.equal(validScheduledWorkerClaims({ ...claims, ...altered }), false)
})
test("cryptographic signature required; workflow dispatch does not count as independent scheduled proof", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "ephemeral-test-key", alg: "RS256" }
  const fetcher = (async () => Response.json({ keys: [jwk] })) as typeof fetch
  const jwt = (event: string) => {
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: jwk.kid })).toString("base64url")
    const body = Buffer.from(JSON.stringify({ ...claims, event_name: event })).toString("base64url")
    return `${header}.${body}.${sign("RSA-SHA256", new TextEncoder().encode(`${header}.${body}`), privateKey).toString("base64url")}`
  }
  assert.deepEqual(await authorizeScheduledWorker(`Bearer ${jwt("schedule")}`, fetcher), { independentSchedule: true })
  assert.deepEqual(await authorizeScheduledWorker(`Bearer ${jwt("workflow_dispatch")}`, fetcher), { independentSchedule: false })
  assert.equal(await authorizeScheduledWorker(`Bearer ${jwt("schedule").slice(0, -20)}bad`, fetcher), null)
  assert.equal(await authorizeScheduledWorker("Bearer arbitrary-token", fetcher), null)
})
