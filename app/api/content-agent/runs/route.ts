import { NextRequest, NextResponse } from "next/server"

import {
  contentAgentIdempotencyKeySchema,
  contentAgentInputSchema,
  contentAgentOutputSchema,
  isContentAgentProviderConfigured,
  runContentAgentProvider,
  type ContentAgentOutput,
} from "@/lib/server/content-agent"
import {
  ContentAgentRunStoreError,
  getContentAgentRunStore,
  toPublicContentAgentRun,
  type ContentAgentRunErrorCode,
  type ContentAgentRunStatus,
  type ContentAgentRunStore,
  type PublicContentAgentRun,
} from "@/lib/server/content-agent-runs"
import { authorizeCustomerApiRequest } from "@/lib/server/customer-api-auth"
import {
  commitCreditReservation,
  getEntitlementSnapshot,
  refundCreditReservation,
  reserveCredits,
  snapshotHasAgentAccess,
} from "@/lib/server/entitlements"
import { consumeDistributedAiRateLimit } from "@/lib/server/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ContentAgentRouteDependencies = {
  authorize: typeof authorizeCustomerApiRequest
  getEntitlements: typeof getEntitlementSnapshot
  hasAgentAccess: typeof snapshotHasAgentAccess
  rateLimit: typeof consumeDistributedAiRateLimit
  reserve: typeof reserveCredits
  commit: typeof commitCreditReservation
  refund: typeof refundCreditReservation
  providerConfigured: typeof isContentAgentProviderConfigured
  runProvider: typeof runContentAgentProvider
  getRunStore: () => ContentAgentRunStore
}

const defaultDependencies: ContentAgentRouteDependencies = {
  authorize: authorizeCustomerApiRequest,
  getEntitlements: getEntitlementSnapshot,
  hasAgentAccess: snapshotHasAgentAccess,
  rateLimit: consumeDistributedAiRateLimit,
  reserve: reserveCredits,
  commit: commitCreditReservation,
  refund: refundCreditReservation,
  providerConfigured: isContentAgentProviderConfigured,
  runProvider: runContentAgentProvider,
  getRunStore: getContentAgentRunStore,
}

type ContentAgentTestGlobals = typeof globalThis & {
  __amsContentAgentTestDependencies?: Partial<ContentAgentRouteDependencies>
}

function dependenciesForRequest(): ContentAgentRouteDependencies {
  const overrides =
    process.env.NODE_ENV === "production"
      ? {}
      : (globalThis as ContentAgentTestGlobals).__amsContentAgentTestDependencies ?? {}
  return { ...defaultDependencies, ...overrides }
}

function noStoreJson(body: Record<string, unknown>, status: number, headers?: HeadersInit) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  })
}

function safeError(code: string, error: string, status: number, run?: PublicContentAgentRun) {
  return noStoreJson(
    {
      ok: false,
      code,
      error,
      ...(run ? { run } : {}),
    },
    status,
  )
}

function resolveIdempotencyKey(request: NextRequest): string | NextResponse {
  const supplied = request.headers.get("idempotency-key")
  const parsed = contentAgentIdempotencyKeySchema.safeParse(supplied)
  if (!parsed.success) {
    return safeError(
      "INVALID_IDEMPOTENCY_KEY",
      "Idempotency-Key must contain 8 to 120 safe characters",
      400,
    )
  }
  return parsed.data
}

function runStoreErrorResponse(error: unknown) {
  if (
    error instanceof ContentAgentRunStoreError &&
    error.code === "CONTENT_RUN_IDEMPOTENCY_CONFLICT"
  ) {
    return safeError(
      "CONTENT_RUN_IDEMPOTENCY_CONFLICT",
      "The idempotency key is already bound to different content input",
      409,
    )
  }
  if (
    error instanceof ContentAgentRunStoreError &&
    error.code === "CONTENT_RUN_INVALID_IDEMPOTENCY_KEY"
  ) {
    return safeError("INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid", 400)
  }
  return safeError(
    "CONTENT_RUN_STORE_UNAVAILABLE",
    "Content run history is unavailable",
    503,
  )
}

function existingRunResponse(run: PublicContentAgentRun) {
  if (run.status === "succeeded") {
    return noStoreJson({ ok: true, idempotent: true, run }, 200)
  }
  if (run.status === "queued" || run.status === "running") {
    return safeError("CONTENT_RUN_IN_PROGRESS", "This content run is already in progress", 202, run)
  }
  if (run.status === "reconciliation") {
    return safeError(
      "CONTENT_RUN_RECONCILIATION_REQUIRED",
      "This content run needs account reconciliation",
      503,
      run,
    )
  }

  const status = run.errorCode === "CREDITS_REQUIRED" ? 402 : 409
  return safeError(
    run.errorCode ?? "CONTENT_RUN_TERMINAL",
    run.status === "refunded"
      ? "This content run failed and its credit was refunded"
      : "This content run did not complete",
    status,
    run,
  )
}

async function recordReconciliation(input: {
  store: ContentAgentRunStore
  ownerSubject: string
  idempotencyKey: string
  expectedStatuses: ContentAgentRunStatus[]
  errorCode: ContentAgentRunErrorCode
}) {
  try {
    await input.store.transition({
      ownerSubject: input.ownerSubject,
      idempotencyKey: input.idempotencyKey,
      expectedStatuses: input.expectedStatuses,
      status: "reconciliation",
      creditState: "reconciliation",
      pendingOutput: null,
      output: null,
      errorCode: input.errorCode,
    })
  } catch {
    // The response remains closed even when reconciliation state cannot be persisted.
  }
}

async function refundAndFail(input: {
  dependencies: ContentAgentRouteDependencies
  store: ContentAgentRunStore
  ownerSubject: string
  idempotencyKey: string
  ledgerKey: string
  expectedStatuses: ContentAgentRunStatus[]
  errorCode: ContentAgentRunErrorCode
  refundFailureCode?: ContentAgentRunErrorCode
  responseCode: string
  responseMessage: string
  responseStatus: number
}) {
  try {
    await input.dependencies.refund({
      subject: input.ownerSubject,
      idempotencyKey: input.ledgerKey,
    })
  } catch {
    const refundFailureCode = input.refundFailureCode ?? "CREDIT_REFUND_FAILED"
    await recordReconciliation({
      store: input.store,
      ownerSubject: input.ownerSubject,
      idempotencyKey: input.idempotencyKey,
      expectedStatuses: input.expectedStatuses,
      errorCode: refundFailureCode,
    })
    return safeError(
      refundFailureCode,
      "The content run failed and its credit needs reconciliation",
      503,
    )
  }

  try {
    await input.store.transition({
      ownerSubject: input.ownerSubject,
      idempotencyKey: input.idempotencyKey,
      expectedStatuses: input.expectedStatuses,
      status: "refunded",
      creditState: "refunded",
      pendingOutput: null,
      output: null,
      errorCode: input.errorCode,
    })
  } catch {
    await recordReconciliation({
      store: input.store,
      ownerSubject: input.ownerSubject,
      idempotencyKey: input.idempotencyKey,
      expectedStatuses: input.expectedStatuses,
      errorCode: "RUN_PERSISTENCE_FAILED",
    })
    return safeError(
      "CONTENT_RUN_RECONCILIATION_REQUIRED",
      "The refunded content run could not be safely persisted",
      503,
    )
  }

  return safeError(input.responseCode, input.responseMessage, input.responseStatus)
}

async function recoverExistingRun(input: {
  dependencies: ContentAgentRouteDependencies
  store: ContentAgentRunStore
  ownerSubject: string
  idempotencyKey: string
  record: Awaited<ReturnType<ContentAgentRunStore["claim"]>>["record"]
}) {
  if (input.record.status !== "running") {
    return existingRunResponse(toPublicContentAgentRun(input.record))
  }
  if (!input.record.pendingOutput) {
    return existingRunResponse(toPublicContentAgentRun(input.record))
  }

  const ledgerKey = `content-agent:${input.idempotencyKey}`
  let reservation: Awaited<ReturnType<typeof reserveCredits>>
  try {
    reservation = await input.dependencies.reserve({
      subject: input.ownerSubject,
      units: 1,
      idempotencyKey: ledgerKey,
    })
  } catch {
    return safeError(
      "CREDIT_RESERVATION_FAILED",
      "The existing content run could not be reconciled with its credit reservation",
      503,
    )
  }

  if (reservation.state === "committed") {
    if (!input.record.pendingOutput) {
      await recordReconciliation({
        store: input.store,
        ownerSubject: input.ownerSubject,
        idempotencyKey: input.idempotencyKey,
        expectedStatuses: ["running"],
        errorCode: "FINAL_PERSISTENCE_FAILED",
      })
      return safeError(
        "FINAL_PERSISTENCE_FAILED",
        "The committed content run has no recoverable staged output",
        503,
      )
    }

    try {
      const completed = await input.store.transition({
        ownerSubject: input.ownerSubject,
        idempotencyKey: input.idempotencyKey,
        expectedStatuses: ["running"],
        status: "succeeded",
        creditState: "committed",
        pendingOutput: null,
        output: input.record.pendingOutput,
        errorCode: null,
      })
      return noStoreJson(
        { ok: true, idempotent: true, run: toPublicContentAgentRun(completed) },
        200,
      )
    } catch {
      return safeError(
        "FINAL_PERSISTENCE_FAILED",
        "The committed content run remains safely staged for retry",
        503,
      )
    }
  }

  if (reservation.state === "refunded") {
    try {
      const refunded = await input.store.transition({
        ownerSubject: input.ownerSubject,
        idempotencyKey: input.idempotencyKey,
        expectedStatuses: ["running"],
        status: "refunded",
        creditState: "refunded",
        pendingOutput: null,
        output: null,
        errorCode: "CREDIT_COMMIT_FAILED_REFUNDED",
      })
      return safeError(
        "CREDIT_COMMIT_FAILED_REFUNDED",
        "The earlier credit commit failed and its reservation was refunded",
        503,
        toPublicContentAgentRun(refunded),
      )
    } catch {
      return safeError(
        "CONTENT_RUN_RECONCILIATION_REQUIRED",
        "The refunded content run remains quarantined",
        503,
      )
    }
  }

  return existingRunResponse(toPublicContentAgentRun(input.record))
}

async function refundAfterCommitFailure(input: {
  dependencies: ContentAgentRouteDependencies
  store: ContentAgentRunStore
  ownerSubject: string
  idempotencyKey: string
  ledgerKey: string
}) {
  // First remove the staged provider output from the run state. If storage is
  // unavailable, the existing running state remains quarantined because public
  // serialization never includes pendingOutput.
  try {
    await input.store.transition({
      ownerSubject: input.ownerSubject,
      idempotencyKey: input.idempotencyKey,
      expectedStatuses: ["running"],
      status: "running",
      creditState: "reserved",
      pendingOutput: null,
      output: null,
      errorCode: null,
    })
  } catch {
    // Continue with the required refund attempt; pending output remains non-public.
  }

  try {
    await input.dependencies.refund({
      subject: input.ownerSubject,
      idempotencyKey: input.ledgerKey,
    })
  } catch {
    await recordReconciliation({
      store: input.store,
      ownerSubject: input.ownerSubject,
      idempotencyKey: input.idempotencyKey,
      expectedStatuses: ["running"],
      errorCode: "CREDIT_COMMIT_AND_REFUND_FAILED",
    })
    return safeError(
      "CREDIT_COMMIT_AND_REFUND_FAILED",
      "Credit commit and refund both failed; account reconciliation is required",
      503,
    )
  }

  try {
    await input.store.transition({
      ownerSubject: input.ownerSubject,
      idempotencyKey: input.idempotencyKey,
      expectedStatuses: ["running"],
      status: "refunded",
      creditState: "refunded",
      pendingOutput: null,
      output: null,
      errorCode: "CREDIT_COMMIT_FAILED_REFUNDED",
    })
  } catch {
    await recordReconciliation({
      store: input.store,
      ownerSubject: input.ownerSubject,
      idempotencyKey: input.idempotencyKey,
      expectedStatuses: ["running"],
      errorCode: "CREDIT_COMMIT_FAILED_REFUNDED",
    })
  }

  return safeError(
    "CREDIT_COMMIT_FAILED_REFUNDED",
    "Credit commit failed; the reservation was refunded and no output was released",
    503,
  )
}

async function handlePost(request: NextRequest, dependencies: ContentAgentRouteDependencies) {
  const principal = await dependencies.authorize(request)
  if (!principal || principal.kind !== "customer") {
    return safeError(
      "CUSTOMER_SESSION_REQUIRED",
      "A signed customer session is required",
      401,
    )
  }

  const parsedInput = contentAgentInputSchema.safeParse(await request.json().catch(() => null))
  if (!parsedInput.success) {
    return safeError(
      "INVALID_CONTENT_INPUT",
      "The content brief is invalid or contains unsupported fields",
      400,
    )
  }

  const idempotencyKey = resolveIdempotencyKey(request)
  if (idempotencyKey instanceof NextResponse) return idempotencyKey

  let rateLimit
  try {
    rateLimit = await dependencies.rateLimit({
      subject: principal.subject,
      operation: "content-agent-run",
    })
  } catch {
    return safeError(
      "RATE_LIMIT_UNAVAILABLE",
      "Content Agent rate limiting is unavailable",
      503,
    )
  }
  if (!rateLimit.available) {
    return safeError(
      "RATE_LIMIT_UNAVAILABLE",
      "Content Agent rate limiting is unavailable",
      503,
    )
  }
  if (!rateLimit.allowed) {
    return noStoreJson(
      {
        ok: false,
        code: "CONTENT_AGENT_RATE_LIMITED",
        error: "Content Agent rate limit exceeded",
      },
      429,
      {
        "Retry-After": String(rateLimit.retryAfterSeconds),
        "X-RateLimit-Limit": String(rateLimit.limit),
        "X-RateLimit-Remaining": "0",
      },
    )
  }

  if (!dependencies.providerConfigured()) {
    return safeError(
      "CONTENT_AGENT_NOT_CONFIGURED",
      "Content Agent is not configured",
      503,
    )
  }

  const snapshot = await dependencies.getEntitlements(principal.subject).catch(() => null)
  if (!snapshot?.configured) {
    return safeError(
      "ENTITLEMENTS_NOT_CONFIGURED",
      "Account entitlements are unavailable",
      503,
    )
  }
  if (!dependencies.hasAgentAccess(snapshot, "content")) {
    return safeError(
      "SUBSCRIPTION_REQUIRED",
      "An active AMS plan is required for Content Agent",
      402,
    )
  }

  let store: ContentAgentRunStore
  try {
    store = dependencies.getRunStore()
  } catch (error) {
    return runStoreErrorResponse(error)
  }

  let claim: Awaited<ReturnType<ContentAgentRunStore["claim"]>>
  try {
    claim = await store.claim({
      ownerSubject: principal.subject,
      idempotencyKey,
      content: parsedInput.data,
    })
  } catch (error) {
    return runStoreErrorResponse(error)
  }
  if (!claim.created) {
    return recoverExistingRun({
      dependencies,
      store,
      ownerSubject: principal.subject,
      idempotencyKey,
      record: claim.record,
    })
  }

  const ledgerKey = `content-agent:${idempotencyKey}`
  let reservation: Awaited<ReturnType<typeof reserveCredits>>
  try {
    reservation = await dependencies.reserve({
      subject: principal.subject,
      units: 1,
      idempotencyKey: ledgerKey,
    })
  } catch {
    await recordReconciliation({
      store,
      ownerSubject: principal.subject,
      idempotencyKey,
      expectedStatuses: ["queued"],
      errorCode: "CREDIT_RESERVATION_FAILED",
    })
    return safeError(
      "CREDIT_RESERVATION_FAILED",
      "A content credit could not be safely reserved",
      503,
    )
  }

  if (reservation.state === "rejected") {
    try {
      await store.transition({
        ownerSubject: principal.subject,
        idempotencyKey,
        expectedStatuses: ["queued"],
        status: "failed",
        creditState: "rejected",
        pendingOutput: null,
        output: null,
        errorCode: "CREDITS_REQUIRED",
      })
    } catch {
      return safeError(
        "CONTENT_RUN_STORE_UNAVAILABLE",
        "The rejected content run could not be safely persisted",
        503,
      )
    }
    return safeError("CREDITS_REQUIRED", "No Content Agent credits remain", 402)
  }

  if (reservation.idempotent || reservation.state !== "reserved") {
    await recordReconciliation({
      store,
      ownerSubject: principal.subject,
      idempotencyKey,
      expectedStatuses: ["queued"],
      errorCode: "CREDIT_RESERVATION_REPLAY",
    })
    return safeError(
      "CREDIT_RESERVATION_REPLAY",
      "The credit reservation is already bound to an earlier operation",
      409,
    )
  }

  try {
    await store.transition({
      ownerSubject: principal.subject,
      idempotencyKey,
      expectedStatuses: ["queued"],
      status: "running",
      creditState: "reserved",
      pendingOutput: null,
      output: null,
      errorCode: null,
    })
  } catch {
    return refundAndFail({
      dependencies,
      store,
      ownerSubject: principal.subject,
      idempotencyKey,
      ledgerKey,
      expectedStatuses: ["queued", "running"],
      errorCode: "RUN_STAGE_FAILED_REFUNDED",
      refundFailureCode: "RUN_STAGE_AND_REFUND_FAILED",
      responseCode: "RUN_STAGE_FAILED_REFUNDED",
      responseMessage: "The content run could not safely start",
      responseStatus: 503,
    })
  }

  let providerOutput: ContentAgentOutput
  try {
    const rawOutput = await dependencies.runProvider(parsedInput.data)
    const parsedOutput = contentAgentOutputSchema.safeParse(rawOutput)
    if (!parsedOutput.success) {
      return refundAndFail({
        dependencies,
        store,
        ownerSubject: principal.subject,
        idempotencyKey,
        ledgerKey,
        expectedStatuses: ["running"],
        errorCode: "CONTENT_PROVIDER_INVALID_RESPONSE",
        responseCode: "CONTENT_PROVIDER_INVALID_RESPONSE",
        responseMessage: "Content Agent returned an invalid structured response",
        responseStatus: 502,
      })
    }
    providerOutput = parsedOutput.data
  } catch {
    return refundAndFail({
      dependencies,
      store,
      ownerSubject: principal.subject,
      idempotencyKey,
      ledgerKey,
      expectedStatuses: ["running"],
      errorCode: "CONTENT_PROVIDER_FAILED",
      responseCode: "CONTENT_PROVIDER_FAILED",
      responseMessage: "Content Agent provider request failed",
      responseStatus: 502,
    })
  }

  try {
    await store.transition({
      ownerSubject: principal.subject,
      idempotencyKey,
      expectedStatuses: ["running"],
      status: "running",
      creditState: "reserved",
      pendingOutput: providerOutput,
      output: null,
      errorCode: null,
    })
  } catch {
    return refundAndFail({
      dependencies,
      store,
      ownerSubject: principal.subject,
      idempotencyKey,
      ledgerKey,
      expectedStatuses: ["running"],
      errorCode: "RUN_STAGE_FAILED_REFUNDED",
      refundFailureCode: "RUN_STAGE_AND_REFUND_FAILED",
      responseCode: "RUN_STAGE_FAILED_REFUNDED",
      responseMessage: "Content Agent output could not be safely staged",
      responseStatus: 503,
    })
  }

  try {
    await dependencies.commit({
      subject: principal.subject,
      idempotencyKey: ledgerKey,
    })
  } catch {
    return refundAfterCommitFailure({
      dependencies,
      store,
      ownerSubject: principal.subject,
      idempotencyKey,
      ledgerKey,
    })
  }

  let completed
  try {
    completed = await store.transition({
      ownerSubject: principal.subject,
      idempotencyKey,
      expectedStatuses: ["running"],
      status: "succeeded",
      creditState: "committed",
      pendingOutput: null,
      output: providerOutput,
      errorCode: null,
    })
  } catch {
    return safeError(
      "FINAL_PERSISTENCE_FAILED",
      "Content Agent output is committed and safely staged for retry",
      503,
    )
  }

  return noStoreJson(
    { ok: true, idempotent: false, run: toPublicContentAgentRun(completed) },
    200,
    {
      "X-RateLimit-Limit": String(rateLimit.limit),
      "X-RateLimit-Remaining": String(rateLimit.remaining),
    },
  )
}

async function handleGet(request: NextRequest, dependencies: ContentAgentRouteDependencies) {
  const principal = await dependencies.authorize(request)
  if (!principal || principal.kind !== "customer") {
    return safeError(
      "CUSTOMER_SESSION_REQUIRED",
      "A signed customer session is required",
      401,
    )
  }

  try {
    const runs = await dependencies.getRunStore().listForOwner(principal.subject, 20)
    return noStoreJson({ ok: true, runs }, 200)
  } catch (error) {
    return runStoreErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  return handlePost(request, dependenciesForRequest())
}

export async function GET(request: NextRequest) {
  return handleGet(request, dependenciesForRequest())
}
