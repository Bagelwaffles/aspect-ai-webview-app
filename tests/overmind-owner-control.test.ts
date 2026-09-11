import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { getAgentContract } from "../lib/agent-contract-registry"
import {
  approveOvermindTask,
  createOvermindTask,
  listOvermindTaskAudit,
  rejectOvermindTask,
} from "../lib/server/overmind-task-store"
import {
  createOvermindAuthorizationCode,
  exchangeOvermindAuthorizationCode,
  isAllowedChatGPTRedirectUri,
  oauthAuthorizationServerMetadata,
  oauthProtectedResourceMetadata,
  OVERMIND_OWNER_RESOURCE,
  OVERMIND_TASK_READ_SCOPE,
  OVERMIND_TASK_WRITE_SCOPE,
  refreshOvermindAccessToken,
  registerOvermindOAuthClient,
  validateOvermindAccessToken,
} from "../lib/server/overmind-mcp-oauth"

class FakeRedis {
  readonly strings = new Map<string, string>()
  readonly lists = new Map<string, string[]>()

  async get<T = unknown>(key: string): Promise<T | null> {
    return (this.strings.get(key) ?? null) as T | null
  }

  async set(key: string, value: string) {
    this.strings.set(key, value)
    return "OK"
  }

  async del(...keys: string[]) {
    let removed = 0
    for (const key of keys) removed += this.strings.delete(key) ? 1 : 0
    return removed
  }

  async lpush(key: string, ...values: string[]) {
    const current = this.lists.get(key) ?? []
    this.lists.set(key, [...values, ...current])
    return this.lists.get(key)?.length ?? 0
  }

  async ltrim(key: string, start: number, stop: number) {
    const current = this.lists.get(key) ?? []
    this.lists.set(key, current.slice(start, stop + 1))
    return "OK"
  }

  async lrange<T = unknown>(key: string, start: number, stop: number): Promise<T[]> {
    return (this.lists.get(key) ?? []).slice(start, stop + 1) as T[]
  }
}

const actor = `customer:google:${"a".repeat(64)}`

function liveSocialContract(slug: string) {
  const contract = getAgentContract(slug)
  if (!contract) return null
  return slug === "social-publisher-agent"
    ? {
        ...contract,
        status: "live" as const,
        liveProof: { verified: true, evidence: "test fixture", nextMilestone: "monitor" },
      }
    : contract
}

test("task creation is retry-idempotent and conflicts on changed action", async () => {
  const redis = new FakeRedis()
  const input = {
    objective: "Create one private AMS content draft without external publication.",
    idempotencyKey: "work-retry-20260911-001",
    action: {
      agentSlug: "content-agent",
      mode: "draft",
      operation: "generate-content-draft",
      target: "customer-workspace",
      summary: "Generate one private content draft.",
      parameters: { format: "social-post" },
    },
  }

  const first = await createOvermindTask(input, actor, { redis })
  const second = await createOvermindTask(input, actor, { redis })
  assert.equal(first.id, second.id)
  assert.equal(first.actionDigest, second.actionDigest)

  await assert.rejects(
    () => createOvermindTask({
      ...input,
      action: { ...input.action, summary: "Generate a changed draft." },
    }, actor, { redis }),
    /OVERMIND_IDEMPOTENCY_CONFLICT/,
  )
})

test("owner can reject a pending mutation and rejection is audited", async () => {
  const redis = new FakeRedis()
  const task = await createOvermindTask({
    objective: "Prepare one exact approved social publishing action for later execution.",
    idempotencyKey: "reject-test-20260911",
    action: {
      agentSlug: "social-publisher-agent",
      mode: "write",
      operation: "publish-approved-post",
      target: "linkedin:organization:approved",
      summary: "Publish one already-reviewed organization post.",
      parameters: { postId: "draft-789" },
    },
  }, actor, { redis, resolveContract: liveSocialContract })

  assert.equal(task.status, "pending_approval")
  const rejected = await rejectOvermindTask(task.id, actor, { redis, resolveContract: liveSocialContract })
  assert.equal(rejected.status, "rejected")
  assert.equal(rejected.executionEligible, false)
  await assert.rejects(
    () => approveOvermindTask(rejected.id, { actionDigest: rejected.actionDigest }, actor, { redis, resolveContract: liveSocialContract }),
    /OVERMIND_TASK_REJECTED/,
  )
  const audit = await listOvermindTaskAudit(task.id, { redis })
  assert.deepEqual(audit.map((event) => event.type), ["task.rejected", "task.created"])
})

test("valid approval retry does not extend or duplicate an existing approval", async () => {
  const redis = new FakeRedis()
  const task = await createOvermindTask({
    objective: "Prepare one exact approved social publishing action for later execution.",
    idempotencyKey: "approval-test-20260911",
    action: {
      agentSlug: "social-publisher-agent",
      mode: "write",
      operation: "publish-approved-post",
      target: "linkedin:organization:approved",
      summary: "Publish one reviewed organization post.",
      parameters: { postId: "draft-456" },
    },
  }, actor, {
    redis,
    resolveContract: liveSocialContract,
    now: () => new Date("2026-09-11T22:00:00.000Z"),
  })

  const approved = await approveOvermindTask(task.id, { actionDigest: task.actionDigest, expiresInMinutes: 10 }, actor, {
    redis,
    resolveContract: liveSocialContract,
    now: () => new Date("2026-09-11T22:01:00.000Z"),
  })
  const retried = await approveOvermindTask(task.id, { actionDigest: task.actionDigest, expiresInMinutes: 30 }, actor, {
    redis,
    resolveContract: liveSocialContract,
    now: () => new Date("2026-09-11T22:02:00.000Z"),
  })
  assert.equal(retried.approvalExpiresAt, approved.approvalExpiresAt)
  const audit = await listOvermindTaskAudit(task.id, { redis })
  assert.equal(audit.filter((event) => event.type === "task.approved").length, 1)
})

test("OAuth metadata is least-privilege and ChatGPT redirects are strictly allowlisted", () => {
  const authorization = oauthAuthorizationServerMetadata()
  assert.equal(authorization.client_id_metadata_document_supported, true)
  assert.equal(authorization.authorization_response_iss_parameter_supported, true)
  assert.deepEqual(authorization.code_challenge_methods_supported, ["S256"])

  const resource = oauthProtectedResourceMetadata()
  assert.deepEqual(resource.scopes_supported, [OVERMIND_TASK_READ_SCOPE, OVERMIND_TASK_WRITE_SCOPE])
  assert.equal(resource.scopes_supported.includes("offline_access"), false)
  assert.equal(isAllowedChatGPTRedirectUri("https://chatgpt.com/connector_platform_oauth_redirect"), true)
  assert.equal(isAllowedChatGPTRedirectUri("https://chatgpt.com/connector/oauth/abc_123"), true)
  assert.equal(isAllowedChatGPTRedirectUri("https://evil.example/connector/oauth/abc"), false)
  assert.equal(isAllowedChatGPTRedirectUri("https://chatgpt.com.evil.example/connector/oauth/abc"), false)
})

test("OAuth authorization code is PKCE-bound and refresh token rotates", async () => {
  const redis = new FakeRedis()
  const tokens = [
    "clienttoken_abcdefghijklmnopqrstuvwxyz012345",
    "authorizationcode_abcdefghijklmnopqrstuvwxyz",
    "accesstoken_abcdefghijklmnopqrstuvwxyz0123456",
    "refreshtoken_abcdefghijklmnopqrstuvwxyz012345",
    "accesstoken2_abcdefghijklmnopqrstuvwxyz012345",
    "refreshtoken2_abcdefghijklmnopqrstuvwxyz01234",
  ]
  const options = {
    redis,
    now: () => new Date("2026-09-11T22:10:00.000Z"),
    randomToken: () => tokens.shift() ?? "fallbacktoken_abcdefghijklmnopqrstuvwxyz012345",
  }
  const redirectUri = "https://chatgpt.com/connector/oauth/test_callback"
  const client = await registerOvermindOAuthClient({ client_name: "ChatGPT", redirect_uris: [redirectUri] }, options)
  const verifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~"
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  const code = await createOvermindAuthorizationCode({
    clientId: client.client_id,
    redirectUri,
    actorSubject: actor,
    scope: `${OVERMIND_TASK_READ_SCOPE} ${OVERMIND_TASK_WRITE_SCOPE} offline_access`,
    resource: OVERMIND_OWNER_RESOURCE,
    codeChallenge: challenge,
  }, options)

  await assert.rejects(
    () => exchangeOvermindAuthorizationCode({
      code,
      clientId: client.client_id,
      redirectUri,
      codeVerifier: "x".repeat(64),
      resource: OVERMIND_OWNER_RESOURCE,
    }, options),
    /OVERMIND_OAUTH_PKCE_INVALID/,
  )

  const pair = await exchangeOvermindAuthorizationCode({
    code,
    clientId: client.client_id,
    redirectUri,
    codeVerifier: verifier,
    resource: OVERMIND_OWNER_RESOURCE,
  }, options)
  const readPrincipal = await validateOvermindAccessToken(pair.access_token, OVERMIND_TASK_READ_SCOPE, options)
  const writePrincipal = await validateOvermindAccessToken(pair.access_token, OVERMIND_TASK_WRITE_SCOPE, options)
  assert.equal(readPrincipal?.actorSubject, actor)
  assert.equal(writePrincipal?.actorSubject, actor)

  const refreshed = await refreshOvermindAccessToken({
    refreshToken: pair.refresh_token,
    clientId: client.client_id,
    resource: OVERMIND_OWNER_RESOURCE,
  }, options)
  assert.notEqual(refreshed.refresh_token, pair.refresh_token)
  await assert.rejects(
    () => refreshOvermindAccessToken({ refreshToken: pair.refresh_token, clientId: client.client_id }, options),
    /OVERMIND_OAUTH_REFRESH_INVALID/,
  )
})

test("owner MCP source exposes only task-ledger control and no executor", async () => {
  const source = await readFile(new URL("../app/api/mcp/owner/route.ts", import.meta.url), "utf8")
  for (const name of [
    "ams_list_tasks",
    "ams_get_task",
    "ams_get_task_audit",
    "ams_create_task",
    "ams_approve_task",
    "ams_reject_task",
    "ams_cancel_task",
  ]) {
    assert.match(source, new RegExp(`name: \\"${name}\\"`))
  }
  assert.doesNotMatch(source, /name:\s*"ams_(execute|publish|send|bill|deploy|delete)/)
  assert.match(source, /executionEnabled:\s*false/)
  assert.match(source, /externalMutationEnabled:\s*false/)
})
