import assert from "node:assert/strict"
import test from "node:test"

import {
  buildGoogleDriveAuthorizationUrl,
  createGoogleDriveOauthAttempt,
  GOOGLE_DRIVE_SCOPE,
  isGoogleDriveConnectorConfigured,
  readGoogleDriveOauthAttempt,
  resolveGoogleDriveOauthConfig,
} from "../lib/server/google-drive-connection"

const subject = `customer:google:${"d".repeat(64)}`
const otherSubject = `customer:google:${"e".repeat(64)}`
const env: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "test",
  PUBLIC_APP_URL: "https://www.aspectmarketingsolutions.app",
  NEXTAUTH_SECRET: "drive-oauth-state-signing-test-secret",
  AMS_GOOGLE_DRIVE_CLIENT_ID: "test-client.apps.googleusercontent.com",
  AMS_GOOGLE_DRIVE_CLIENT_SECRET: "test-client-secret",
  AMS_CONNECTION_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "test-redis-token",
}

test("Google Drive connector fails closed until OAuth and vault configuration are complete", () => {
  assert.equal(isGoogleDriveConnectorConfigured({ ...process.env, NODE_ENV: "test" }), false)
  assert.equal(
    resolveGoogleDriveOauthConfig({
      ...env,
      AMS_GOOGLE_DRIVE_CLIENT_SECRET: "",
    }),
    null,
  )
  assert.equal(isGoogleDriveConnectorConfigured(env), true)
})

test("Drive OAuth uses least-privilege drive.file with PKCE and exact AMS callback", () => {
  const attempt = createGoogleDriveOauthAttempt(subject, env, Date.parse("2026-09-11T19:30:00.000Z"))
  const url = buildGoogleDriveAuthorizationUrl(attempt, env)
  const scopes = new Set((url.searchParams.get("scope") ?? "").split(/\s+/))

  assert.equal(url.origin, "https://accounts.google.com")
  assert.equal(url.searchParams.get("redirect_uri"), "https://www.aspectmarketingsolutions.app/api/customer/connections/google-drive/callback")
  assert.equal(url.searchParams.get("access_type"), "offline")
  assert.equal(url.searchParams.get("code_challenge_method"), "S256")
  assert.ok(url.searchParams.get("code_challenge"))
  assert.ok(scopes.has(GOOGLE_DRIVE_SCOPE))
  assert.equal(scopes.has("https://www.googleapis.com/auth/drive.readonly"), false)
  assert.equal(scopes.has("https://www.googleapis.com/auth/drive"), false)
})

test("signed OAuth attempt is bound to state, customer subject and expiration", () => {
  const now = Date.parse("2026-09-11T19:30:00.000Z")
  const attempt = createGoogleDriveOauthAttempt(subject, env, now)
  const read = readGoogleDriveOauthAttempt(attempt.cookieValue, subject, attempt.state, env, now + 1_000)

  assert.equal(read.state, attempt.state)
  assert.ok(read.codeVerifier.length >= 43)

  assert.throws(
    () => readGoogleDriveOauthAttempt(attempt.cookieValue, otherSubject, attempt.state, env, now + 1_000),
    /GOOGLE_DRIVE_OAUTH_STATE_INVALID/,
  )
  assert.throws(
    () => readGoogleDriveOauthAttempt(attempt.cookieValue, subject, `${attempt.state}x`, env, now + 1_000),
    /GOOGLE_DRIVE_OAUTH_STATE_INVALID/,
  )
  assert.throws(
    () => readGoogleDriveOauthAttempt(`${attempt.cookieValue}tampered`, subject, attempt.state, env, now + 1_000),
    /GOOGLE_DRIVE_OAUTH_STATE_INVALID/,
  )
  assert.throws(
    () => readGoogleDriveOauthAttempt(attempt.cookieValue, subject, attempt.state, env, now + 11 * 60 * 1000),
    /GOOGLE_DRIVE_OAUTH_STATE_EXPIRED/,
  )
})
