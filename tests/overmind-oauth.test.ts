import assert from "node:assert/strict"
import test from "node:test"

import {
  accessTokenHasScope,
  createOvermindAuthorizationCode,
  exchangeOvermindAuthorizationCode,
  isAllowedOvermindOAuthRedirectUri,
  OVERMIND_OWNER_MCP_RESOURCE,
  overmindPkceS256,
  refreshOvermindAccessToken,
  registerOvermindOAuthClient,
  verifyOvermindAccessToken,
  type OvermindOAuthRedisLike,
} from "../lib/server/overmind-oauth"

class MemoryRedis implements OvermindOAuthRedisLike {
  private values = new Map<string, string>()

  async get<T = unknown>(key: string): Promise<T | null> {
    return (this.values.get(key) as T | undefined) ?? null
  }

  async getdel<T = unknown>(key: string): Promise<T | null> {
    const value = (this.values.get(key) as T | undefined) ?? null
    this.values.delete(key)
    return value
  }

  async set(key: string, value: string): Promise<unknown> {
    this.values.set(key, value)
    return "OK"
  }
}

function tokens() {
  const values = ["c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n"].map((letter) => letter.repeat(43))
  return () => {
    const value = values.shift()
    if (!value) throw new Error("test token pool exhausted")
    return value
  }
}

const owner = {
  subject: `customer:google:${"a".repeat(64)}`,
  email: "owner@example.com",
}
const redirectUri = "https://chatgpt.com/connector_platform_oauth_redirect"

function authorizationInput(clientId: string, verifier: string, scope = "overmind.read overmind.control offline_access") {
  return {
    response_type: "code" as const,
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    state: "state-12345678",
    code_challenge: overmindPkceS256(verifier),
    code_challenge_method: "S256" as const,
    resource: OVERMIND_OWNER_MCP_RESOURCE,
  }
}

test("owner OAuth client registration is restricted to OpenAI and ChatGPT HTTPS redirects", async () => {
  assert.equal(isAllowedOvermindOAuthRedirectUri(redirectUri), true)
  assert.equal(isAllowedOvermindOAuthRedirectUri("https://evil.example/callback"), false)
  assert.equal(isAllowedOvermindOAuthRedirectUri("http://chatgpt.com/callback"), false)

  const redis = new MemoryRedis()
  await assert.rejects(
    registerOvermindOAuthClient(
      { client_name: "bad", redirect_uris: ["https://evil.example/callback"] },
      { redis, randomToken: tokens() },
    ),
    /OVERMIND_OAUTH_REDIRECT_URI_REJECTED/,
  )
})

test("owner OAuth codes are PKCE-bound and atomically one-time", async () => {
  const redis = new MemoryRedis()
  const randomToken = tokens()
  const now = () => new Date("2026-09-11T22:40:00.000Z")

  const client = await registerOvermindOAuthClient(
    {
      client_name: "Aspect Overmind Owner",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      application_type: "web",
    },
    { redis, randomToken, now },
  )

  const verifier = "v".repeat(43)
  const rejectedAuthorization = await createOvermindAuthorizationCode(
    authorizationInput(client.client_id, verifier),
    owner,
    { redis, randomToken, now },
  )

  await assert.rejects(
    exchangeOvermindAuthorizationCode(
      {
        code: rejectedAuthorization.code,
        clientId: client.client_id,
        redirectUri,
        codeVerifier: "x".repeat(43),
        resource: OVERMIND_OWNER_MCP_RESOURCE,
      },
      { redis, randomToken, now },
    ),
    /OVERMIND_OAUTH_PKCE_MISMATCH/,
  )

  await assert.rejects(
    exchangeOvermindAuthorizationCode(
      {
        code: rejectedAuthorization.code,
        clientId: client.client_id,
        redirectUri,
        codeVerifier: verifier,
        resource: OVERMIND_OWNER_MCP_RESOURCE,
      },
      { redis, randomToken, now },
    ),
    /OVERMIND_OAUTH_CODE_INVALID/,
  )

  const authorization = await createOvermindAuthorizationCode(
    authorizationInput(client.client_id, verifier),
    owner,
    { redis, randomToken, now },
  )
  const first = await exchangeOvermindAuthorizationCode(
    {
      code: authorization.code,
      clientId: client.client_id,
      redirectUri,
      codeVerifier: verifier,
      resource: OVERMIND_OWNER_MCP_RESOURCE,
    },
    { redis, randomToken, now },
  )

  assert.equal(first.token_type, "Bearer")
  assert.ok(first.refresh_token)
  const access = await verifyOvermindAccessToken(first.access_token, { redis, now })
  assert.ok(access)
  assert.equal(access?.ownerSubject, owner.subject)
  assert.equal(access && accessTokenHasScope(access, "overmind.control"), true)

  await assert.rejects(
    exchangeOvermindAuthorizationCode(
      {
        code: authorization.code,
        clientId: client.client_id,
        redirectUri,
        codeVerifier: verifier,
        resource: OVERMIND_OWNER_MCP_RESOURCE,
      },
      { redis, randomToken, now },
    ),
    /OVERMIND_OAUTH_CODE_INVALID/,
  )

  const refreshed = await refreshOvermindAccessToken(
    {
      refreshToken: first.refresh_token!,
      clientId: client.client_id,
      resource: OVERMIND_OWNER_MCP_RESOURCE,
    },
    { redis, randomToken, now },
  )
  assert.ok(refreshed.refresh_token)
  assert.notEqual(refreshed.refresh_token, first.refresh_token)

  await assert.rejects(
    refreshOvermindAccessToken(
      {
        refreshToken: first.refresh_token!,
        clientId: client.client_id,
        resource: OVERMIND_OWNER_MCP_RESOURCE,
      },
      { redis, randomToken, now },
    ),
    /OVERMIND_OAUTH_REFRESH_TOKEN_INVALID/,
  )
})

test("refresh tokens cannot escalate scopes", async () => {
  const redis = new MemoryRedis()
  const randomToken = tokens()
  const now = () => new Date("2026-09-11T22:50:00.000Z")
  const client = await registerOvermindOAuthClient(
    { client_name: "Aspect Overmind Owner", redirect_uris: [redirectUri] },
    { redis, randomToken, now },
  )
  const verifier = "q".repeat(43)
  const authorization = await createOvermindAuthorizationCode(
    authorizationInput(client.client_id, verifier, "overmind.read offline_access"),
    owner,
    { redis, randomToken, now },
  )
  const tokensIssued = await exchangeOvermindAuthorizationCode(
    {
      code: authorization.code,
      clientId: client.client_id,
      redirectUri,
      codeVerifier: verifier,
      resource: OVERMIND_OWNER_MCP_RESOURCE,
    },
    { redis, randomToken, now },
  )

  await assert.rejects(
    refreshOvermindAccessToken(
      {
        refreshToken: tokensIssued.refresh_token!,
        clientId: client.client_id,
        resource: OVERMIND_OWNER_MCP_RESOURCE,
        scope: "overmind.read overmind.control offline_access",
      },
      { redis, randomToken, now },
    ),
    /OVERMIND_OAUTH_SCOPE_ESCALATION_REJECTED/,
  )

  await assert.rejects(
    refreshOvermindAccessToken(
      {
        refreshToken: tokensIssued.refresh_token!,
        clientId: client.client_id,
        resource: OVERMIND_OWNER_MCP_RESOURCE,
      },
      { redis, randomToken, now },
    ),
    /OVERMIND_OAUTH_REFRESH_TOKEN_INVALID/,
  )
})
