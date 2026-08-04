import { createHash } from "node:crypto"

import type { Redis } from "@upstash/redis"

export type CreditReservationState = "reserved" | "committed" | "refunded" | "rejected"
export type CreditLedgerAction = "reserved" | "reserve_rejected" | "debited" | "refunded"

export type CreditBalances = {
  planCredits: number
  topupCredits: number
  totalCredits: number
}

export type ReserveCreditsInput = {
  account: string
  amount: number
  idempotencyKey: string
}

export type FinalizeCreditReservationInput = {
  account: string
  idempotencyKey: string
}

export type CreditReservationResult = CreditBalances & {
  reservationId: string
  amount: number
  planUnits: number
  topupUnits: number
  state: CreditReservationState
  reserved: boolean
  idempotent: boolean
}

export type CreditFinalizationResult = CreditBalances & {
  reservationId: string
  amount: number
  planUnits: number
  topupUnits: number
  state: "committed" | "refunded"
  idempotent: boolean
}

export type CreditLedgerErrorCode =
  | "CREDIT_LEDGER_INVALID_ACCOUNT"
  | "CREDIT_LEDGER_INVALID_AMOUNT"
  | "CREDIT_LEDGER_IDEMPOTENCY_KEY_REQUIRED"
  | "CREDIT_LEDGER_IDEMPOTENCY_CONFLICT"
  | "CREDIT_LEDGER_RESERVATION_NOT_FOUND"
  | "CREDIT_LEDGER_TERMINAL_STATE_CONFLICT"
  | "CREDIT_LEDGER_CORRUPT_BALANCE"
  | "CREDIT_LEDGER_DATASTORE_ERROR"
  | "CREDIT_LEDGER_INVALID_DATASTORE_RESPONSE"

export class CreditLedgerError extends Error {
  readonly code: CreditLedgerErrorCode
  readonly operation: CreditLedgerStorageCommand["operation"] | "validation"
  readonly reservationState?: CreditReservationState

  constructor(
    code: CreditLedgerErrorCode,
    message: string,
    options: {
      operation?: CreditLedgerStorageCommand["operation"] | "validation"
      reservationState?: CreditReservationState
      cause?: unknown
    } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = "CreditLedgerError"
    this.code = code
    this.operation = options.operation ?? "validation"
    this.reservationState = options.reservationState
  }
}

type CreditLedgerKeys = {
  plan: string
  topup: string
  cycle: string
  reservation: string
  ledger: string
}

type CreditLedgerCommandBase = {
  account: string
  accountHash: string
  idempotencyKeyHash: string
  reservationId: string
  keys: CreditLedgerKeys
  timestamp: string
}

export type CreditLedgerStorageCommand =
  | (CreditLedgerCommandBase & {
      operation: "reserve"
      amount: number
      bindingHash: string
    })
  | (CreditLedgerCommandBase & {
      operation: "commit" | "refund"
    })

export type CreditLedgerStorageResult = {
  status:
    | "reserved"
    | "rejected"
    | "committed"
    | "refunded"
    | "existing"
    | "not_found"
    | "conflict"
    | "terminal_conflict"
    | "corrupt"
  state?: CreditReservationState
  amount?: number
  planUnits?: number
  topupUnits?: number
  planCredits?: number
  topupCredits?: number
}

export interface CreditLedgerAdapter {
  execute(command: CreditLedgerStorageCommand): Promise<CreditLedgerStorageResult>
}

const RESERVE_SCRIPT = `
  local existingState = redis.call('HGET', KEYS[3], 'state')
  if existingState then
    local existingBinding = redis.call('HGET', KEYS[3], 'bindingHash')
    if existingBinding ~= ARGV[3] then
      return {'conflict', existingState}
    end

    local currentPlan = tonumber(redis.call('GET', KEYS[1]) or '0')
    local currentTopup = tonumber(redis.call('GET', KEYS[2]) or '0')
    if currentPlan < 0 or currentTopup < 0 then
      return {'corrupt', tostring(currentPlan), tostring(currentTopup)}
    end

    return {
      'existing',
      existingState,
      redis.call('HGET', KEYS[3], 'amount') or '0',
      redis.call('HGET', KEYS[3], 'planUnits') or '0',
      redis.call('HGET', KEYS[3], 'topupUnits') or '0',
      tostring(currentPlan),
      tostring(currentTopup)
    }
  end

  local amount = tonumber(ARGV[1])
  local plan = tonumber(redis.call('GET', KEYS[1]) or '0')
  local topup = tonumber(redis.call('GET', KEYS[2]) or '0')
  local planCycle = redis.call('GET', KEYS[5]) or ''
  if plan < 0 or topup < 0 then
    return {'corrupt', tostring(plan), tostring(topup)}
  end

  if plan + topup < amount then
    redis.call(
      'HSET', KEYS[3],
      'accountHash', ARGV[2],
      'bindingHash', ARGV[3],
      'reservationId', ARGV[4],
      'amount', ARGV[1],
      'planUnits', '0',
      'topupUnits', '0',
      'planCycle', planCycle,
      'state', 'rejected',
      'createdAt', ARGV[5],
      'updatedAt', ARGV[5]
    )
    redis.call(
      'XADD', KEYS[4], 'MAXLEN', '~', 1000, '*',
      'action', 'reserve_rejected',
      'reservationId', ARGV[4],
      'amount', ARGV[1],
      'planUnits', '0',
      'topupUnits', '0',
      'availablePlan', tostring(plan),
      'availableTopup', tostring(topup),
      'at', ARGV[5]
    )
    return {'rejected', 'rejected', ARGV[1], '0', '0', tostring(plan), tostring(topup)}
  end

  local fromPlan = math.min(plan, amount)
  local fromTopup = amount - fromPlan
  local newPlan = plan - fromPlan
  local newTopup = topup - fromTopup

  redis.call('SET', KEYS[1], newPlan)
  redis.call('SET', KEYS[2], newTopup)
  redis.call(
    'HSET', KEYS[3],
    'accountHash', ARGV[2],
    'bindingHash', ARGV[3],
    'reservationId', ARGV[4],
    'amount', ARGV[1],
    'planUnits', tostring(fromPlan),
    'topupUnits', tostring(fromTopup),
    'planCycle', planCycle,
    'state', 'reserved',
    'createdAt', ARGV[5],
    'updatedAt', ARGV[5]
  )
  redis.call(
    'XADD', KEYS[4], 'MAXLEN', '~', 1000, '*',
    'action', 'reserved',
    'reservationId', ARGV[4],
    'amount', ARGV[1],
    'planUnits', tostring(fromPlan),
    'topupUnits', tostring(fromTopup),
    'availablePlan', tostring(newPlan),
    'availableTopup', tostring(newTopup),
    'at', ARGV[5]
  )

  return {
    'reserved',
    'reserved',
    ARGV[1],
    tostring(fromPlan),
    tostring(fromTopup),
    tostring(newPlan),
    tostring(newTopup)
  }
`

const COMMIT_SCRIPT = `
  local state = redis.call('HGET', KEYS[1], 'state')
  if not state then
    return {'not_found'}
  end

  local accountHash = redis.call('HGET', KEYS[1], 'accountHash')
  if accountHash ~= ARGV[1] then
    return {'conflict', state}
  end

  local plan = tonumber(redis.call('GET', KEYS[3]) or '0')
  local topup = tonumber(redis.call('GET', KEYS[4]) or '0')
  if plan < 0 or topup < 0 then
    return {'corrupt', tostring(plan), tostring(topup)}
  end

  local amount = redis.call('HGET', KEYS[1], 'amount') or '0'
  local planUnits = redis.call('HGET', KEYS[1], 'planUnits') or '0'
  local topupUnits = redis.call('HGET', KEYS[1], 'topupUnits') or '0'

  if state == 'committed' then
    return {'existing', state, amount, planUnits, topupUnits, tostring(plan), tostring(topup)}
  end
  if state ~= 'reserved' then
    return {'terminal_conflict', state}
  end

  redis.call('HSET', KEYS[1], 'state', 'committed', 'updatedAt', ARGV[3])
  redis.call(
    'XADD', KEYS[2], 'MAXLEN', '~', 1000, '*',
    'action', 'debited',
    'reservationId', ARGV[2],
    'amount', amount,
    'planUnits', planUnits,
    'topupUnits', topupUnits,
    'availablePlan', tostring(plan),
    'availableTopup', tostring(topup),
    'at', ARGV[3]
  )

  return {'committed', 'committed', amount, planUnits, topupUnits, tostring(plan), tostring(topup)}
`

const REFUND_SCRIPT = `
  local state = redis.call('HGET', KEYS[1], 'state')
  if not state then
    return {'not_found'}
  end

  local accountHash = redis.call('HGET', KEYS[1], 'accountHash')
  if accountHash ~= ARGV[1] then
    return {'conflict', state}
  end

  local plan = tonumber(redis.call('GET', KEYS[3]) or '0')
  local topup = tonumber(redis.call('GET', KEYS[4]) or '0')
  if plan < 0 or topup < 0 then
    return {'corrupt', tostring(plan), tostring(topup)}
  end

  local amount = redis.call('HGET', KEYS[1], 'amount') or '0'
  local planUnits = tonumber(redis.call('HGET', KEYS[1], 'planUnits') or '0')
  local topupUnits = tonumber(redis.call('HGET', KEYS[1], 'topupUnits') or '0')
  local reservedPlanCycle = redis.call('HGET', KEYS[1], 'planCycle') or ''
  local currentPlanCycle = redis.call('GET', KEYS[5]) or ''

  if state == 'refunded' then
    return {
      'existing',
      state,
      amount,
      tostring(planUnits),
      tostring(topupUnits),
      tostring(plan),
      tostring(topup)
    }
  end
  if state ~= 'reserved' then
    return {'terminal_conflict', state}
  end

  local restoredPlanUnits = 0
  if reservedPlanCycle == currentPlanCycle then
    restoredPlanUnits = planUnits
  end

  local newPlan = plan + restoredPlanUnits
  local newTopup = topup + topupUnits
  redis.call('SET', KEYS[3], newPlan)
  redis.call('SET', KEYS[4], newTopup)
  redis.call('HSET', KEYS[1], 'state', 'refunded', 'updatedAt', ARGV[3])
  redis.call(
    'XADD', KEYS[2], 'MAXLEN', '~', 1000, '*',
    'action', 'refunded',
    'reservationId', ARGV[2],
    'amount', amount,
    'planUnits', tostring(planUnits),
    'planUnitsRestored', tostring(restoredPlanUnits),
    'topupUnits', tostring(topupUnits),
    'reservedPlanCycle', reservedPlanCycle,
    'currentPlanCycle', currentPlanCycle,
    'availablePlan', tostring(newPlan),
    'availableTopup', tostring(newTopup),
    'at', ARGV[3]
  )

  return {
    'refunded',
    'refunded',
    amount,
    tostring(planUnits),
    tostring(topupUnits),
    tostring(newPlan),
    tostring(newTopup)
  }
`

function normalizeAccount(account: string): string {
  return account.trim().toLowerCase()
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

export function creditBalanceKeys(account: string) {
  const normalizedAccount = normalizeAccount(account)
  return {
    plan: `ams:credits:plan:${normalizedAccount}`,
    topup: `ams:credits:topup:${normalizedAccount}`,
    cycle: `ams:credits:cycle:${normalizedAccount}`,
  }
}

function buildCommandBase(account: string, idempotencyKey: string, timestamp: string) {
  const normalizedAccount = normalizeAccount(account)
  const normalizedKey = idempotencyKey.trim()
  const accountHash = hashValue(normalizedAccount)
  const idempotencyKeyHash = hashValue(normalizedKey)
  const reservationId = hashValue(`${normalizedAccount}\u0000${normalizedKey}`)
  const balanceKeys = creditBalanceKeys(normalizedAccount)

  return {
    account: normalizedAccount,
    accountHash,
    idempotencyKeyHash,
    reservationId,
    timestamp,
    keys: {
      ...balanceKeys,
      reservation: `ams:credits:reservation:${accountHash}:${idempotencyKeyHash}`,
      ledger: `ams:credits:ledger:${accountHash}`,
    },
  }
}

function integer(value: unknown, field: string): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Invalid ${field} in credit ledger datastore response`)
  }
  return parsed
}

function parseStorageResult(raw: unknown): CreditLedgerStorageResult {
  if (!Array.isArray(raw) || typeof raw[0] !== "string") {
    throw new Error("Invalid credit ledger datastore response")
  }

  const status = raw[0] as CreditLedgerStorageResult["status"]
  if (status === "not_found") return { status }
  if (status === "conflict" || status === "terminal_conflict") {
    return { status, state: raw[1] as CreditReservationState | undefined }
  }
  if (status === "corrupt") {
    return {
      status,
      planCredits: integer(raw[1], "planCredits"),
      topupCredits: integer(raw[2], "topupCredits"),
    }
  }

  if (!["reserved", "rejected", "committed", "refunded", "existing"].includes(status)) {
    throw new Error("Unknown credit ledger datastore response")
  }

  return {
    status,
    state: raw[1] as CreditReservationState,
    amount: integer(raw[2], "amount"),
    planUnits: integer(raw[3], "planUnits"),
    topupUnits: integer(raw[4], "topupUnits"),
    planCredits: integer(raw[5], "planCredits"),
    topupCredits: integer(raw[6], "topupCredits"),
  }
}

export class UpstashCreditLedgerAdapter implements CreditLedgerAdapter {
  constructor(private readonly redis: Pick<Redis, "eval">) {}

  async execute(command: CreditLedgerStorageCommand): Promise<CreditLedgerStorageResult> {
    if (command.operation === "reserve") {
      const raw = await this.redis.eval(
        RESERVE_SCRIPT,
        [
          command.keys.plan,
          command.keys.topup,
          command.keys.reservation,
          command.keys.ledger,
          command.keys.cycle,
        ],
        [command.amount, command.accountHash, command.bindingHash, command.reservationId, command.timestamp],
      )
      return parseStorageResult(raw)
    }

    const script = command.operation === "commit" ? COMMIT_SCRIPT : REFUND_SCRIPT
    const raw = await this.redis.eval(
      script,
      [
        command.keys.reservation,
        command.keys.ledger,
        command.keys.plan,
        command.keys.topup,
        command.keys.cycle,
      ],
      [command.accountHash, command.reservationId, command.timestamp],
    )
    return parseStorageResult(raw)
  }
}

function balances(result: CreditLedgerStorageResult): CreditBalances {
  const planCredits = result.planCredits
  const topupCredits = result.topupCredits
  if (
    planCredits === undefined ||
    topupCredits === undefined ||
    planCredits < 0 ||
    topupCredits < 0
  ) {
    throw new CreditLedgerError(
      "CREDIT_LEDGER_INVALID_DATASTORE_RESPONSE",
      "Credit ledger datastore returned invalid balances",
    )
  }

  return {
    planCredits,
    topupCredits,
    totalCredits: planCredits + topupCredits,
  }
}

function reservationFields(result: CreditLedgerStorageResult) {
  const reservedUnits = (result.planUnits ?? 0) + (result.topupUnits ?? 0)
  const allocationIsValid =
    result.state === "rejected" ? reservedUnits === 0 : reservedUnits === result.amount
  if (
    result.amount === undefined ||
    result.planUnits === undefined ||
    result.topupUnits === undefined ||
    result.amount < 1 ||
    result.planUnits < 0 ||
    result.topupUnits < 0 ||
    !allocationIsValid
  ) {
    throw new CreditLedgerError(
      "CREDIT_LEDGER_INVALID_DATASTORE_RESPONSE",
      "Credit ledger datastore returned invalid reservation data",
    )
  }

  return {
    amount: result.amount,
    planUnits: result.planUnits,
    topupUnits: result.topupUnits,
  }
}

export class CreditLedger {
  constructor(
    private readonly adapter: CreditLedgerAdapter,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async reserve(input: ReserveCreditsInput): Promise<CreditReservationResult> {
    const account = normalizeAccount(input.account)
    const idempotencyKey = input.idempotencyKey.trim()
    if (!account) {
      throw new CreditLedgerError("CREDIT_LEDGER_INVALID_ACCOUNT", "Credit account is required")
    }
    if (!idempotencyKey) {
      throw new CreditLedgerError(
        "CREDIT_LEDGER_IDEMPOTENCY_KEY_REQUIRED",
        "A credit reservation idempotency key is required",
      )
    }
    if (idempotencyKey.length > 200) {
      throw new CreditLedgerError(
        "CREDIT_LEDGER_IDEMPOTENCY_KEY_REQUIRED",
        "Credit reservation idempotency key is too long",
      )
    }
    if (!Number.isSafeInteger(input.amount) || input.amount < 1) {
      throw new CreditLedgerError(
        "CREDIT_LEDGER_INVALID_AMOUNT",
        "Credit reservation amount must be a positive integer",
      )
    }

    const command: CreditLedgerStorageCommand = {
      ...buildCommandBase(account, idempotencyKey, this.now().toISOString()),
      operation: "reserve",
      amount: input.amount,
      bindingHash: hashValue(`${account}\u0000${input.amount}\u0000${idempotencyKey}`),
    }
    const result = await this.execute(command)

    if (result.status === "conflict") {
      throw new CreditLedgerError(
        "CREDIT_LEDGER_IDEMPOTENCY_CONFLICT",
        "Idempotency key is already bound to a different credit reservation",
        { operation: "reserve", reservationState: result.state },
      )
    }
    if (result.status === "corrupt") {
      throw new CreditLedgerError(
        "CREDIT_LEDGER_CORRUPT_BALANCE",
        "Credit account contains a negative balance",
        { operation: "reserve" },
      )
    }
    if (!["reserved", "rejected", "existing"].includes(result.status) || !result.state) {
      throw new CreditLedgerError(
        "CREDIT_LEDGER_INVALID_DATASTORE_RESPONSE",
        "Credit ledger datastore returned an invalid reserve result",
        { operation: "reserve" },
      )
    }

    return {
      reservationId: command.reservationId,
      ...reservationFields(result),
      ...balances(result),
      state: result.state,
      reserved: result.state !== "rejected",
      idempotent: result.status === "existing",
    }
  }

  async commit(input: FinalizeCreditReservationInput): Promise<CreditFinalizationResult> {
    return this.finalize("commit", input)
  }

  async refund(input: FinalizeCreditReservationInput): Promise<CreditFinalizationResult> {
    return this.finalize("refund", input)
  }

  private async finalize(
    operation: "commit" | "refund",
    input: FinalizeCreditReservationInput,
  ): Promise<CreditFinalizationResult> {
    const account = normalizeAccount(input.account)
    const idempotencyKey = input.idempotencyKey.trim()
    if (!account) {
      throw new CreditLedgerError("CREDIT_LEDGER_INVALID_ACCOUNT", "Credit account is required")
    }
    if (!idempotencyKey) {
      throw new CreditLedgerError(
        "CREDIT_LEDGER_IDEMPOTENCY_KEY_REQUIRED",
        "A credit reservation idempotency key is required",
      )
    }
    if (idempotencyKey.length > 200) {
      throw new CreditLedgerError(
        "CREDIT_LEDGER_IDEMPOTENCY_KEY_REQUIRED",
        "Credit reservation idempotency key is too long",
      )
    }

    const command: CreditLedgerStorageCommand = {
      ...buildCommandBase(account, idempotencyKey, this.now().toISOString()),
      operation,
    }
    const result = await this.execute(command)

    if (result.status === "not_found") {
      throw new CreditLedgerError(
        "CREDIT_LEDGER_RESERVATION_NOT_FOUND",
        "Credit reservation was not found",
        { operation },
      )
    }
    if (result.status === "conflict") {
      throw new CreditLedgerError(
        "CREDIT_LEDGER_IDEMPOTENCY_CONFLICT",
        "Credit reservation does not belong to this account",
        { operation, reservationState: result.state },
      )
    }
    if (result.status === "terminal_conflict") {
      throw new CreditLedgerError(
        "CREDIT_LEDGER_TERMINAL_STATE_CONFLICT",
        `Credit reservation cannot be ${operation === "commit" ? "committed" : "refunded"} from its current state`,
        { operation, reservationState: result.state },
      )
    }
    if (result.status === "corrupt") {
      throw new CreditLedgerError(
        "CREDIT_LEDGER_CORRUPT_BALANCE",
        "Credit account contains a negative balance",
        { operation },
      )
    }

    const expectedState = operation === "commit" ? "committed" : "refunded"
    if (
      ![expectedState, "existing"].includes(result.status) ||
      result.state !== expectedState
    ) {
      throw new CreditLedgerError(
        "CREDIT_LEDGER_INVALID_DATASTORE_RESPONSE",
        "Credit ledger datastore returned an invalid terminal result",
        { operation },
      )
    }

    return {
      reservationId: command.reservationId,
      ...reservationFields(result),
      ...balances(result),
      state: expectedState,
      idempotent: result.status === "existing",
    }
  }

  private async execute(command: CreditLedgerStorageCommand): Promise<CreditLedgerStorageResult> {
    try {
      return await this.adapter.execute(command)
    } catch (error) {
      if (error instanceof CreditLedgerError) throw error
      throw new CreditLedgerError(
        "CREDIT_LEDGER_DATASTORE_ERROR",
        `Credit ledger ${command.operation} operation failed`,
        { operation: command.operation, cause: error },
      )
    }
  }
}

export function createUpstashCreditLedger(redis: Pick<Redis, "eval">): CreditLedger {
  return new CreditLedger(new UpstashCreditLedgerAdapter(redis))
}
