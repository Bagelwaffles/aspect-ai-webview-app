import { randomBytes } from "node:crypto"
import { writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { encode } from "next-auth/jwt"

const required = [
  "VERCEL_TOKEN",
  "VERCEL_ORG_ID",
  "VERCEL_PROJECT_ID",
  "AMS_APP_URL",
  "CURRENT_PRODUCTION_DEPLOYMENT_ID",
]
for (const name of required) {
  if (!process.env[name]) throw new Error("Missing required activation context: " + name)
}

const vercelToken = process.env.VERCEL_TOKEN
const teamId = process.env.VERCEL_ORG_ID
const projectId = process.env.VERCEL_PROJECT_ID
const appUrl = process.env.AMS_APP_URL.replace(/\/+$/, "")
const deploymentId = process.env.CURRENT_PRODUCTION_DEPLOYMENT_ID
const headers = { authorization: "Bearer " + vercelToken }

function fail(message) {
  throw new Error(message)
}

function mask(value) {
  if (value) console.log("::add-mask::" + value)
}

function isProduction(record) {
  const target = record?.target
  return Array.isArray(target) ? target.includes("production") : target === "production"
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, init)
  let body = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  return { response, body }
}

const listUrl = new URL("https://api.vercel.com/v10/projects/" + projectId + "/env")
listUrl.searchParams.set("teamId", teamId)
listUrl.searchParams.set("decrypt", "true")
const listed = await fetchJson(listUrl, { headers })
if (!listed.response.ok) fail("Vercel environment lookup failed with HTTP " + listed.response.status)
const envs = Array.isArray(listed.body?.envs) ? listed.body.envs : []

async function resolveProductionValue(key) {
  const record = envs.find((entry) => entry?.key === key && isProduction(entry)) ?? null
  if (!record) return { record: null, value: null }

  let value = typeof record.value === "string" ? record.value : null
  if (!value || value === "[SENSITIVE]") {
    const detailUrl = new URL(
      "https://api.vercel.com/v1/projects/" + projectId + "/env/" + record.id,
    )
    detailUrl.searchParams.set("teamId", teamId)
    const detail = await fetchJson(detailUrl, { headers })
    if (detail.response.ok && typeof detail.body?.value === "string") {
      value = detail.body.value
    }
  }
  return { record, value }
}

let cron = await resolveProductionValue("CRON_SECRET")
const cronExisted = Boolean(cron.record)
let cronCreated = false

if (!cron.record) {
  const value = randomBytes(48).toString("base64url")
  const createUrl = new URL("https://api.vercel.com/v10/projects/" + projectId + "/env")
  createUrl.searchParams.set("teamId", teamId)
  createUrl.searchParams.set("upsert", "true")
  const created = await fetchJson(createUrl, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify([
      {
        key: "CRON_SECRET",
        value,
        type: "sensitive",
        target: ["production"],
        comment: "Independent secret for the backend-only AMS monitoring cron",
      },
    ]),
  })
  if (!created.response.ok) {
    fail("CRON_SECRET creation failed with HTTP " + created.response.status)
  }
  cron = { record: { key: "CRON_SECRET", target: ["production"] }, value }
  cronCreated = true
}

let cronRotatedForActivation = false
if (!cron.value || cron.value === "[SENSITIVE]") {
  const value = randomBytes(48).toString("base64url")
  const rotateUrl = new URL("https://api.vercel.com/v10/projects/" + projectId + "/env")
  rotateUrl.searchParams.set("teamId", teamId)
  rotateUrl.searchParams.set("upsert", "true")
  const rotated = await fetchJson(rotateUrl, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify([
      {
        key: "CRON_SECRET",
        value,
        type: "sensitive",
        target: ["production"],
        comment: "Independent secret for the backend-only AMS monitoring cron",
      },
    ]),
  })
  if (!rotated.response.ok) {
    fail("CRON_SECRET activation rotation failed with HTTP " + rotated.response.status)
  }
  cron = { record: { key: "CRON_SECRET", target: ["production"] }, value }
  cronRotatedForActivation = true
}

const nextAuth = await resolveProductionValue("NEXTAUTH_SECRET")
const owner = await resolveProductionValue("AMS_OWNER_EMAIL")
if (!nextAuth.value || nextAuth.value === "[SENSITIVE]") {
  fail("NEXTAUTH_SECRET could not be resolved for owner-endpoint acceptance.")
}
if (!owner.value) fail("AMS_OWNER_EMAIL is not configured for owner-endpoint acceptance.")

const alertUrl = envs.some(
  (entry) => entry?.key === "AMS_MONITOR_ALERT_WEBHOOK_URL" && isProduction(entry),
)
const alertSecret = envs.some(
  (entry) => entry?.key === "AMS_MONITOR_ALERT_WEBHOOK_SECRET" && isProduction(entry),
)
const alertTransport = alertUrl && alertSecret
  ? "configured"
  : !alertUrl && !alertSecret
    ? "not_configured"
    : "partial"

mask(cron.value)
mask(nextAuth.value)
console.log("CRON_SECRET production presence before activation: " + (cronExisted ? "yes" : "no"))
console.log("CRON_SECRET created during activation: " + (cronCreated ? "yes" : "no"))\nconsole.log("CRON_SECRET rotated to complete activation: " + (cronRotatedForActivation ? "yes" : "no"))
console.log("Optional alert transport state: " + alertTransport)

let productionRedeployed = false

function redeployCurrentProduction() {
  execFileSync(
    "npx",
    [
      "--yes",
      "vercel@latest",
      "redeploy",
      deploymentId,
      "--non-interactive",
      "--token",
      vercelToken,
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        VERCEL_ORG_ID: teamId,
        VERCEL_PROJECT_ID: projectId,
      },
    },
  )
  productionRedeployed = true
}

if (cronCreated) {
  redeployCurrentProduction()
  console.log("Production redeployed because CRON_SECRET was newly created.")
}

async function executeMonitoring() {
  const response = await fetch(appUrl + "/api/internal/monitoring/run", {
    method: "GET",
    headers: { authorization: "Bearer " + cron.value },
    cache: "no-store",
  })
  let body = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  return { response, body }
}

let monitoring = await executeMonitoring()
if (monitoring.response.status === 401 && !productionRedeployed) {
  console.log("Existing CRON_SECRET is not active in the current deployment; redeploying the exact production deployment.")
  redeployCurrentProduction()
  monitoring = await executeMonitoring()
}

if (!monitoring.response.ok) {
  fail(
    "Controlled monitoring execution returned HTTP " +
      monitoring.response.status +
      " (" +
      (monitoring.body?.code ?? monitoring.body?.error ?? "unknown") +
      ").",
  )
}
if (monitoring.body?.ok !== true || monitoring.body?.monitors !== 9) {
  fail("Controlled monitoring execution did not report the expected 9 monitors.")
}
const checkedAt = monitoring.body.checkedAt
if (typeof checkedAt !== "string" || !checkedAt) fail("Monitoring run did not return checkedAt.")
console.log(
  "Monitoring run succeeded: 9 monitors, overall=" +
    monitoring.body.overallStatus +
    ", newEvents=" +
    monitoring.body.newEvents +
    ".",
)

const ownerEmail = owner.value.trim().toLowerCase()
const ownerSession = await encode({
  token: {
    sub: "ams-monitoring-activation-acceptance",
    email: ownerEmail,
    name: "AMS Monitoring Acceptance",
  },
  secret: nextAuth.value,
  maxAge: 5 * 60,
})
mask(ownerSession)

const ownerResponse = await fetch(appUrl + "/api/internal/monitoring", {
  method: "GET",
  headers: {
    cookie:
      "__Secure-next-auth.session-token=" +
      ownerSession +
      "; next-auth.session-token=" +
      ownerSession,
  },
  cache: "no-store",
})
let ownerBody = null
try {
  ownerBody = await ownerResponse.json()
} catch {
  ownerBody = null
}
if (!ownerResponse.ok) {
  fail(
    "Owner monitoring endpoint returned HTTP " +
      ownerResponse.status +
      " (" +
      (ownerBody?.code ?? ownerBody?.error ?? "unknown") +
      ").",
  )
}

if (
  ownerBody?.ok !== true ||
  ownerBody?.executionPerformed !== false ||
  ownerBody?.snapshot?.version !== "backend-monitoring-v1" ||
  !Array.isArray(ownerBody?.snapshot?.results) ||
  ownerBody.snapshot.results.length !== 9
) {
  fail("Owner endpoint response did not contain the expected persisted monitoring snapshot.")
}
if (ownerBody.snapshot.checkedAt !== checkedAt) {
  fail("Owner endpoint did not return the snapshot created by the controlled monitoring run.")
}

const expectedTitles = [
  "Core Infrastructure",
  "Revenue & Fulfillment",
  "Overmind Task Queue",
  "Social Publishing",
  "Twitch Media & Rendering",
  "Fiverr Operations",
  "Google Play Release",
  "Visibility & Catalog Truth",
  "Agent Lifecycle",
]
const seenTitles = new Set(ownerBody.snapshot.results.map((item) => item?.title))
for (const title of expectedTitles) {
  if (!seenTitles.has(title)) fail("Expected monitor missing from persisted snapshot: " + title)
}

console.log("Redis snapshot verified through the authenticated owner endpoint.")
for (const item of ownerBody.snapshot.results) {
  console.log(" - " + item.title + ": " + item.status)
}

const unauthOwner = await fetch(appUrl + "/api/internal/monitoring", {
  method: "GET",
  cache: "no-store",
})
const unauthCron = await fetch(appUrl + "/api/internal/monitoring/run", {
  method: "GET",
  cache: "no-store",
})
if (unauthOwner.status !== 401) {
  fail("Unauthenticated owner endpoint returned HTTP " + unauthOwner.status + " instead of 401.")
}
if (unauthCron.status !== 401) {
  fail("Unauthenticated cron endpoint returned HTTP " + unauthCron.status + " instead of 401.")
}
console.log("Unauthenticated owner endpoint: HTTP 401")
console.log("Unauthenticated cron endpoint: HTTP 401")

const result = {
  cronSecretConfigured: true,
  cronSecretExisted,
  cronSecretCreated: cronCreated,\n  cronSecretRotatedForActivation,
  productionRedeployed,
  monitoringRunExecuted: true,
  redisSnapshotVerified: true,
  ownerEndpointVerified: true,
  unauthenticatedAccessBlocked: true,
  alertTransport,
  monitoringCheckedAt: checkedAt,
  overallStatus: ownerBody.snapshot.overallStatus,
  monitorStatuses: ownerBody.snapshot.results.map((item) => ({
    title: item.title,
    status: item.status,
    summary: item.summary,
  })),
  productionCommit: "b70858c70b9d067d96d5d342cbd03a0fcf0efa34",
}
writeFileSync("monitoring-activation-result.json", JSON.stringify(result, null, 2))
console.log("Monitoring activation acceptance completed successfully.")
