import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { authorizeCustomerApiRequest } from "@/lib/server/customer-api-auth"
import { getContentAgentRunStore } from "@/lib/server/content-agent-runs"
import { requestHasTrustedAppOrigin } from "@/lib/server/request-origin"
import {
  customerCampaignAutomationInputSchema,
  toCustomerCampaignAutomation,
} from "@/lib/server/customer-campaign-automation"
import {
  createCustomerCampaignAutomation,
  listCustomerCampaignAutomations,
  updateCustomerCampaignAutomation,
} from "@/lib/server/customer-campaign-automation-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Dependencies = {
  authorize: typeof authorizeCustomerApiRequest
  trustedOrigin: typeof requestHasTrustedAppOrigin
  runStore: typeof getContentAgentRunStore
  create: typeof createCustomerCampaignAutomation
  list: typeof listCustomerCampaignAutomations
  update: typeof updateCustomerCampaignAutomation
}
const defaults: Dependencies = {
  authorize: authorizeCustomerApiRequest,
  trustedOrigin: requestHasTrustedAppOrigin,
  runStore: getContentAgentRunStore,
  create: createCustomerCampaignAutomation,
  list: listCustomerCampaignAutomations,
  update: updateCustomerCampaignAutomation,
}

type TestGlobals = typeof globalThis & {
  __amsCustomerCampaignAutomationTestDependencies?: Partial<Dependencies>
}
function deps(): Dependencies {
  const overrides = process.env.NODE_ENV === "production"
    ? {}
    : (globalThis as TestGlobals).__amsCustomerCampaignAutomationTestDependencies ?? {}
  return { ...defaults, ...overrides }
}
function respond(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}
function storeFailure(error: unknown) {
  const code = error instanceof Error ? error.message : ""
  if (code === "AUTOMATION_IDEMPOTENCY_CONFLICT" ||
      code === "AUTOMATION_REVISION_CONFLICT" ||
      code === "AUTOMATION_INVALID_TRANSITION") {
    return respond({ ok: false, code }, 409)
  }
  if (code === "AUTOMATION_START_TIME_OUT_OF_RANGE") {
    return respond({ ok: false, code }, 400)
  }
  return respond({ ok: false, code: "AUTOMATION_STORE_UNAVAILABLE" }, 503)
}

export async function GET(request: NextRequest) {
  const d = deps()
  const principal = await d.authorize(request)
  if (!principal || principal.kind !== "customer") {
    return respond({ ok: false, code: "CUSTOMER_SESSION_REQUIRED" }, 401)
  }
  try {
    const records = await d.list(principal.subject)
    return respond({
      ok: true, deliveryEnabled: false,
      plans: records.map(toCustomerCampaignAutomation),
    })
  } catch (error) { return storeFailure(error) }
}

export async function POST(request: NextRequest) {
  const d = deps()
  if (!d.trustedOrigin(request)) return respond({ ok: false, code: "UNTRUSTED_ORIGIN" }, 403)
  const principal = await d.authorize(request)
  if (!principal || principal.kind !== "customer") {
    return respond({ ok: false, code: "CUSTOMER_SESSION_REQUIRED" }, 401)
  }
  const body = await request.json().catch(() => null)
  const parsed = customerCampaignAutomationInputSchema.safeParse(body)
  if (!parsed.success) return respond({ ok: false, code: "INVALID_AUTOMATION_DRAFT" }, 400)
  try {
    // Check ownership and success through the existing tenant-scoped Content Run store.
    // The source is an immutable successful AI draft; no customer contacts are read.
    const source = (await d.runStore().listForOwner(principal.subject, 20))
      .find((run) => run.id === parsed.data.sourceRunId)
    if (!source || source.status !== "succeeded" ||
        source.creditState !== "committed" || !source.output) {
      return respond({ ok: false, code: "SUCCESSFUL_OWNED_RUN_REQUIRED" }, 404)
    }
    const saved = await d.create(principal.subject, parsed.data, source.updatedAt)
    return respond({
      ok: true,
      created: saved.created,
      deliveryEnabled: false,
      plan: toCustomerCampaignAutomation(saved.record),
    }, saved.created ? 201 : 200)
  } catch (error) { return storeFailure(error) }
}

const updateSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["review", "pause"]),
  reviewConfirmed: z.boolean().optional(),
}).strict()

export async function PATCH(request: NextRequest) {
  const d = deps()
  if (!d.trustedOrigin(request)) return respond({ ok: false, code: "UNTRUSTED_ORIGIN" }, 403)
  const principal = await d.authorize(request)
  if (!principal || principal.kind !== "customer") {
    return respond({ ok: false, code: "CUSTOMER_SESSION_REQUIRED" }, 401)
  }
  const parsed = updateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success || (parsed.data.action === "review" && parsed.data.reviewConfirmed !== true)) {
    return respond({ ok: false, code: "REVIEW_CONFIRMATION_REQUIRED" }, 400)
  }
  try {
    const record = await d.update(principal.subject, parsed.data.id, parsed.data.action)
    if (!record) return respond({ ok: false, code: "AUTOMATION_NOT_FOUND" }, 404)
    return respond({
      ok: true, deliveryEnabled: false, plan: toCustomerCampaignAutomation(record),
    })
  } catch (error) { return storeFailure(error) }
}
