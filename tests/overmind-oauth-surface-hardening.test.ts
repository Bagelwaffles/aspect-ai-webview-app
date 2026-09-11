import assert from "node:assert/strict"
import test from "node:test"

import { NextRequest } from "next/server"

import { GET as getProtectedResource } from "../app/.well-known/oauth-protected-resource/route"
import { POST as postOwnerMcp } from "../app/api/mcp-owner/route"
import { POST as registerOAuthClient } from "../app/api/oauth/register/route"

function registrationRequest(redirectUri: string) {
  return new NextRequest("https://www.aspectmarketingsolutions.app/api/oauth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Aspect Overmind Control",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  })
}

test("OAuth registration rejects broad OpenAI and ChatGPT host matches", async () => {
  for (const redirectUri of [
    "https://evil.openai.com/callback",
    "https://foo.chatgpt.com/callback",
    "https://chatgpt.com/arbitrary-callback",
    "https://connectors.api.openai.com/arbitrary-callback",
    "https://chatgpt.com/connector_platform_oauth_redirect?next=https://evil.example",
  ]) {
    const response = await registerOAuthClient(registrationRequest(redirectUri))
    assert.equal(response.status, 400)
    const body = await response.json()
    assert.equal(body.error, "invalid_client_metadata")
    assert.equal(body.error_description, "OVERMIND_OAUTH_REDIRECT_URI_REJECTED")
  }
})

test("protected resource advertises only API authorization scopes", async () => {
  const response = await getProtectedResource()
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.deepEqual(body.scopes_supported, ["overmind.read", "overmind.control"])
  assert.equal(body.scopes_supported.includes("offline_access"), false)
})

test("unauthenticated owner MCP challenge excludes offline access", async () => {
  const request = new NextRequest("https://www.aspectmarketingsolutions.app/api/mcp-owner", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  })
  const response = await postOwnerMcp(request)
  assert.equal(response.status, 401)
  const challenge = response.headers.get("www-authenticate") ?? ""
  assert.match(challenge, /overmind\.read/)
  assert.match(challenge, /overmind\.control/)
  assert.doesNotMatch(challenge, /offline_access/)
})
