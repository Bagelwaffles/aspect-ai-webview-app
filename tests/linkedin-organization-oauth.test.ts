import assert from "node:assert/strict"
import test from "node:test"

import {
  buildLinkedInAuthorizationUrl,
  createLinkedInOauthAttempt,
  exchangeLinkedInAuthorizationCode,
  getLinkedInOrganizationConnectionStatus,
  getStoredLinkedInOrganizationAccessToken,
  isLinkedInOrganizationOAuthConfigured,
  LINKEDIN_ORGANIZATION_SCOPES,
  readLinkedInOauthAttempt,
} from "../lib/server/linkedin-organization-connection"

class FakeRedis {
  values = new Map<string, string>()

  async get<T = unknown>(key: string): Promise<T | null> {
    const value = this.values.get(key)
    return (value ?? null) as T | null
  }

  async set(key: string, value: string) {
    this.values.set(key, value)
    return "OK"
  }

  async del(...keys: string[]) {
    let deleted = 0
    for (const key of keys) {
      if (this.values.delete(key)) deleted += 1
    }
    return deleted
  }
}

function env(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    PUBLIC_APP_URL: "https://www.aspectmarketingsolutions.app",
    NEXTAUTH_SECRET: "nextauth-secret-for-linkedin-oauth-tests",
    AMS_CONNECTION_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "redis-test-token",
    AMS_LINKEDIN_CLIENT_ID: "linkedin-client-id",
    AMS_LINKEDIN_CLIENT_SECRET: "linkedin-client-secret",
    AMS_LINKEDIN_AUTHOR_URN: "urn:li:organization:145213077",
    AMS_LINKEDIN_API_VERSION: "202608",
  }
}

test("LinkedIn organization OAuth requests only the required organization scopes", () => {
  const values = env()
  assert.equal(isLinkedInOrganizationOAuthConfigured(values), true)
  const attempt = createLinkedInOauthAttempt(values, 1_000)
  const url = buildLinkedInAuthorizationUrl(attempt.state, values)

  assert.equal(url.origin, "https://www.linkedin.com")
  assert.equal(url.pathname, "/oauth/v2/authorization")
  assert.equal(url.searchParams.get("response_type"), "code")
  assert.equal(url.searchParams.get("client_id"), "linkedin-client-id")
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "https://www.aspectmarketingsolutions.app/api/internal/linkedin/callback",
  )
  assert.equal(url.searchParams.get("scope"), LINKEDIN_ORGANIZATION_SCOPES.join(" "))

  const parsed = readLinkedInOauthAttempt(
    attempt.cookieValue,
    attempt.state,
    values,
    1_001,
  )
  assert.equal(parsed.state, attempt.state)
  assert.throws(
    () => readLinkedInOauthAttempt(attempt.cookieValue, "wrong-state", values, 1_001),
    /LINKEDIN_OAUTH_STATE_INVALID/u,
  )
})

test("fresh LinkedIn OAuth verifies AMS admin access and stores the token encrypted", async () => {
  const redis = new FakeRedis()
  const values = env()
  const calls: string[] = []
  const accessToken = "linkedin_access_token_abcdefghijklmnopqrstuvwxyz"

  const fetcher = (async (input: URL | RequestInfo) => {
    const url = String(input)
    calls.push(url)
    if (url === "https://www.linkedin.com/oauth/v2/accessToken") {
      return new Response(
        JSON.stringify({ access_token: accessToken, expires_in: 5_184_000 }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }
    if (url.startsWith("https://api.linkedin.com/rest/organizationAcls")) {
      return new Response(
        JSON.stringify({
          elements: [
            {
              organization: "urn:li:organization:145213077",
              role: "ADMINISTRATOR",
              state: "APPROVED",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }
    throw new Error("unexpected fetch: " + url)
  }) as typeof fetch

  const connected = await exchangeLinkedInAuthorizationCode("auth-code", {
    env: values,
    redis,
    fetcher,
    now: () => new Date("2026-09-21T17:00:00.000Z"),
  })

  assert.equal(connected.organizationUrn, "urn:li:organization:145213077")
  assert.deepEqual(connected.scopes, [...LINKEDIN_ORGANIZATION_SCOPES])
  assert.equal(calls.length, 2)

  const storedRaw = [...redis.values.values()].join("\n")
  assert.doesNotMatch(storedRaw, new RegExp(accessToken, "u"))

  const status = await getLinkedInOrganizationConnectionStatus({
    env: values,
    redis,
    now: () => new Date("2026-09-21T18:00:00.000Z"),
  })
  assert.equal(status.connected, true)
  assert.equal(status.connection?.organizationId, "145213077")

  const stored = await getStoredLinkedInOrganizationAccessToken({
    env: values,
    redis,
  })
  assert.equal(stored?.accessToken, accessToken)
  assert.equal(stored?.organizationUrn, "urn:li:organization:145213077")
})

test("LinkedIn OAuth refuses an administrator token for the wrong organization", async () => {
  const redis = new FakeRedis()
  const values = env()

  const fetcher = (async (input: URL | RequestInfo) => {
    const url = String(input)
    if (url === "https://www.linkedin.com/oauth/v2/accessToken") {
      return new Response(
        JSON.stringify({
          access_token: "linkedin_access_token_wrong_org_abcdefghijklmnopqrstuvwxyz",
          expires_in: 5_184_000,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }
    return new Response(
      JSON.stringify({
        elements: [
          {
            organization: "urn:li:organization:999999",
            role: "ADMINISTRATOR",
            state: "APPROVED",
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )
  }) as typeof fetch

  await assert.rejects(
    exchangeLinkedInAuthorizationCode("auth-code", {
      env: values,
      redis,
      fetcher,
    }),
    /LINKEDIN_ORGANIZATION_ADMIN_REQUIRED/u,
  )
  assert.equal(redis.values.size, 0)
})
