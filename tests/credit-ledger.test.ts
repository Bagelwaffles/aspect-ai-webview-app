import assert from "node:assert/strict"
import test from "node:test"

import {
  CreditLedger,
  CreditLedgerError,
  type CreditLedgerAction,
  type CreditLedgerAdapter,
  type CreditLedgerStorageCommand,
  type CreditLedgerStorageResult,
  type CreditReservationState,
} from "../lib/server/credit-ledger"

type StoredReservation = {
  accountHash: string
  bindingHash: string
  amount: number
  planUnits: number
  topupUnits: number
  planCycle: string
  state: CreditReservationState
}

type LedgerEntry = {
  action: CreditLedgerAction
  reservationId: string
  amount: number
}

class FakeAtomicCreditLedgerAdapter implements CreditLedgerAdapter {
  private readonly balances = new Map<string, { planCredits: number; topupCredits: number }>()
  private readonly planCycles = new Map<string, string>()
  private readonly reservations = new Map<string, StoredReservation>()
  readonly ledger: LedgerEntry[] = []
  failNextOperation: CreditLedgerStorageCommand["operation"] | null = null

  seed(account: string, planCredits: number, topupCredits: number, planCycle = "") {
    const normalized = account.trim().toLowerCase()
    this.balances.set(normalized, { planCredits, topupCredits })
    this.planCycles.set(normalized, planCycle)
  }

  resetPlanCycle(account: string, planCredits: number, planCycle: string) {
    const normalized = account.trim().toLowerCase()
    const current = this.balances.get(normalized) ?? { planCredits: 0, topupCredits: 0 }
    this.balances.set(normalized, { ...current, planCredits })
    this.planCycles.set(normalized, planCycle)
  }

  snapshot(account: string) {
    return { ...(this.balances.get(account.trim().toLowerCase()) ?? { planCredits: 0, topupCredits: 0 }) }
  }

  async execute(command: CreditLedgerStorageCommand): Promise<CreditLedgerStorageResult> {
    // Yield once so Promise.all tests exercise competing asynchronous callers.
    // The mutation below is synchronous, matching one atomic Redis Lua execution.
    await Promise.resolve()

    if (this.failNextOperation === command.operation) {
      this.failNextOperation = null
      throw new Error("simulated datastore outage")
    }

    const current = this.balances.get(command.account) ?? { planCredits: 0, topupCredits: 0 }
    if (current.planCredits < 0 || current.topupCredits < 0) {
      return {
        status: "corrupt",
        planCredits: current.planCredits,
        topupCredits: current.topupCredits,
      }
    }

    if (command.operation === "reserve") {
      const existing = this.reservations.get(command.keys.reservation)
      if (existing) {
        if (existing.bindingHash !== command.bindingHash) {
          return { status: "conflict", state: existing.state }
        }
        return this.result("existing", existing, current)
      }

      if (current.planCredits + current.topupCredits < command.amount) {
        const rejected: StoredReservation = {
          accountHash: command.accountHash,
          bindingHash: command.bindingHash,
          amount: command.amount,
          planUnits: 0,
          topupUnits: 0,
          planCycle: this.planCycles.get(command.account) ?? "",
          state: "rejected",
        }
        this.reservations.set(command.keys.reservation, rejected)
        this.ledger.push({
          action: "reserve_rejected",
          reservationId: command.reservationId,
          amount: command.amount,
        })
        return this.result("rejected", rejected, current)
      }

      const planUnits = Math.min(current.planCredits, command.amount)
      const topupUnits = command.amount - planUnits
      const reserved: StoredReservation = {
        accountHash: command.accountHash,
        bindingHash: command.bindingHash,
        amount: command.amount,
        planUnits,
        topupUnits,
        planCycle: this.planCycles.get(command.account) ?? "",
        state: "reserved",
      }
      const updated = {
        planCredits: current.planCredits - planUnits,
        topupCredits: current.topupCredits - topupUnits,
      }
      this.balances.set(command.account, updated)
      this.reservations.set(command.keys.reservation, reserved)
      this.ledger.push({
        action: "reserved",
        reservationId: command.reservationId,
        amount: command.amount,
      })
      return this.result("reserved", reserved, updated)
    }

    const existing = this.reservations.get(command.keys.reservation)
    if (!existing) return { status: "not_found" }
    if (existing.accountHash !== command.accountHash) {
      return { status: "conflict", state: existing.state }
    }

    if (command.operation === "commit") {
      if (existing.state === "committed") return this.result("existing", existing, current)
      if (existing.state !== "reserved") {
        return { status: "terminal_conflict", state: existing.state }
      }

      existing.state = "committed"
      this.ledger.push({
        action: "debited",
        reservationId: command.reservationId,
        amount: existing.amount,
      })
      return this.result("committed", existing, current)
    }

    if (existing.state === "refunded") return this.result("existing", existing, current)
    if (existing.state !== "reserved") {
      return { status: "terminal_conflict", state: existing.state }
    }

    const currentPlanCycle = this.planCycles.get(command.account) ?? ""
    const restoredPlanUnits = existing.planCycle === currentPlanCycle ? existing.planUnits : 0
    const refundedBalance = {
      planCredits: current.planCredits + restoredPlanUnits,
      topupCredits: current.topupCredits + existing.topupUnits,
    }
    existing.state = "refunded"
    this.balances.set(command.account, refundedBalance)
    this.ledger.push({
      action: "refunded",
      reservationId: command.reservationId,
      amount: existing.amount,
    })
    return this.result("refunded", existing, refundedBalance)
  }

  private result(
    status: CreditLedgerStorageResult["status"],
    reservation: StoredReservation,
    balance: { planCredits: number; topupCredits: number },
  ): CreditLedgerStorageResult {
    return {
      status,
      state: reservation.state,
      amount: reservation.amount,
      planUnits: reservation.planUnits,
      topupUnits: reservation.topupUnits,
      planCredits: balance.planCredits,
      topupCredits: balance.topupCredits,
    }
  }
}

function createFixture(account = "owner@example.com", planCredits = 5, topupCredits = 0) {
  const adapter = new FakeAtomicCreditLedgerAdapter()
  adapter.seed(account, planCredits, topupCredits)
  const ledger = new CreditLedger(adapter, () => new Date("2026-08-03T12:00:00.000Z"))
  return { account, adapter, ledger }
}

function hasErrorCode(code: CreditLedgerError["code"]) {
  return (error: unknown) => error instanceof CreditLedgerError && error.code === code
}

test("requires a caller-provided idempotency key and a positive integer amount", async () => {
  const { account, ledger } = createFixture()

  await assert.rejects(
    ledger.reserve({ account, amount: 1, idempotencyKey: "" }),
    hasErrorCode("CREDIT_LEDGER_IDEMPOTENCY_KEY_REQUIRED"),
  )
  await assert.rejects(
    ledger.reserve({ account, amount: 0, idempotencyKey: "run-1" }),
    hasErrorCode("CREDIT_LEDGER_INVALID_AMOUNT"),
  )
})

test("concurrent reservations never make available credits negative", async () => {
  const { account, adapter, ledger } = createFixture("parallel@example.com", 3, 2)

  const results = await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      ledger.reserve({ account, amount: 1, idempotencyKey: `parallel-run-${index}` }),
    ),
  )

  assert.equal(results.filter((result) => result.reserved).length, 5)
  assert.equal(results.filter((result) => !result.reserved).length, 15)
  assert.deepEqual(adapter.snapshot(account), { planCredits: 0, topupCredits: 0 })
  assert.ok(results.every((result) => result.planCredits >= 0 && result.topupCredits >= 0))
  assert.equal(adapter.ledger.filter((entry) => entry.action === "reserved").length, 5)
  assert.equal(adapter.ledger.filter((entry) => entry.action === "reserve_rejected").length, 15)
})

test("binds an idempotency key to the normalized account and amount", async () => {
  const { account, adapter, ledger } = createFixture()

  const first = await ledger.reserve({ account, amount: 2, idempotencyKey: "same-operation" })
  const replay = await ledger.reserve({
    account: account.toUpperCase(),
    amount: 2,
    idempotencyKey: "same-operation",
  })

  assert.equal(first.idempotent, false)
  assert.equal(replay.idempotent, true)
  assert.equal(first.reservationId, replay.reservationId)
  assert.equal(adapter.ledger.filter((entry) => entry.action === "reserved").length, 1)
  await assert.rejects(
    ledger.reserve({ account, amount: 3, idempotencyKey: "same-operation" }),
    hasErrorCode("CREDIT_LEDGER_IDEMPOTENCY_CONFLICT"),
  )
})

test("commit is terminal and idempotent without a duplicate debit entry", async () => {
  const { account, adapter, ledger } = createFixture("commit@example.com", 3)
  await ledger.reserve({ account, amount: 2, idempotencyKey: "commit-once" })

  const results = await Promise.all([
    ledger.commit({ account, idempotencyKey: "commit-once" }),
    ledger.commit({ account, idempotencyKey: "commit-once" }),
  ])

  assert.deepEqual(
    results.map((result) => result.idempotent).sort(),
    [false, true],
  )
  assert.ok(results.every((result) => result.state === "committed"))
  assert.deepEqual(adapter.snapshot(account), { planCredits: 1, topupCredits: 0 })
  assert.equal(adapter.ledger.filter((entry) => entry.action === "debited").length, 1)
})

test("refund is terminal, idempotent, and restores each credit pool exactly once", async () => {
  const { account, adapter, ledger } = createFixture("refund@example.com", 2, 2)
  await ledger.reserve({ account, amount: 3, idempotencyKey: "refund-once" })

  const results = await Promise.all([
    ledger.refund({ account, idempotencyKey: "refund-once" }),
    ledger.refund({ account, idempotencyKey: "refund-once" }),
  ])

  assert.deepEqual(
    results.map((result) => result.idempotent).sort(),
    [false, true],
  )
  assert.ok(results.every((result) => result.state === "refunded"))
  assert.deepEqual(adapter.snapshot(account), { planCredits: 2, topupCredits: 2 })
  assert.equal(adapter.ledger.filter((entry) => entry.action === "refunded").length, 1)
})

test("refund does not mint prior-cycle plan credits after a billing-cycle reset", async () => {
  const account = "cycle-race@example.com"
  const adapter = new FakeAtomicCreditLedgerAdapter()
  adapter.seed(account, 2, 2, "sub_cycle:100")
  const ledger = new CreditLedger(adapter, () => new Date("2026-08-03T12:00:00.000Z"))

  await ledger.reserve({ account, amount: 3, idempotencyKey: "cycle-bound-reservation" })
  assert.deepEqual(adapter.snapshot(account), { planCredits: 0, topupCredits: 1 })

  adapter.resetPlanCycle(account, 10, "sub_cycle:200")
  const refunded = await ledger.refund({
    account,
    idempotencyKey: "cycle-bound-reservation",
  })

  assert.equal(refunded.state, "refunded")
  assert.deepEqual(adapter.snapshot(account), { planCredits: 10, topupCredits: 2 })
  assert.equal(adapter.ledger.filter((entry) => entry.action === "refunded").length, 1)
})

test("opposite terminal operations fail without changing balances", async () => {
  const committed = createFixture("terminal-commit@example.com", 2)
  await committed.ledger.reserve({
    account: committed.account,
    amount: 1,
    idempotencyKey: "terminal-commit",
  })
  await committed.ledger.commit({
    account: committed.account,
    idempotencyKey: "terminal-commit",
  })
  await assert.rejects(
    committed.ledger.refund({
      account: committed.account,
      idempotencyKey: "terminal-commit",
    }),
    hasErrorCode("CREDIT_LEDGER_TERMINAL_STATE_CONFLICT"),
  )
  assert.deepEqual(committed.adapter.snapshot(committed.account), {
    planCredits: 1,
    topupCredits: 0,
  })

  const refunded = createFixture("terminal-refund@example.com", 2)
  await refunded.ledger.reserve({
    account: refunded.account,
    amount: 1,
    idempotencyKey: "terminal-refund",
  })
  await refunded.ledger.refund({
    account: refunded.account,
    idempotencyKey: "terminal-refund",
  })
  await assert.rejects(
    refunded.ledger.commit({
      account: refunded.account,
      idempotencyKey: "terminal-refund",
    }),
    hasErrorCode("CREDIT_LEDGER_TERMINAL_STATE_CONFLICT"),
  )
  assert.deepEqual(refunded.adapter.snapshot(refunded.account), {
    planCredits: 2,
    topupCredits: 0,
  })
})

test("datastore failures are explicit and can be retried with the same key", async () => {
  const { account, adapter, ledger } = createFixture("failure@example.com", 2)
  adapter.failNextOperation = "reserve"

  await assert.rejects(
    ledger.reserve({ account, amount: 1, idempotencyKey: "outage" }),
    hasErrorCode("CREDIT_LEDGER_DATASTORE_ERROR"),
  )
  assert.deepEqual(adapter.snapshot(account), { planCredits: 2, topupCredits: 0 })
  assert.equal(adapter.ledger.length, 0)

  await ledger.reserve({ account, amount: 1, idempotencyKey: "outage" })
  adapter.failNextOperation = "commit"
  await assert.rejects(
    ledger.commit({ account, idempotencyKey: "outage" }),
    hasErrorCode("CREDIT_LEDGER_DATASTORE_ERROR"),
  )

  const committed = await ledger.commit({ account, idempotencyKey: "outage" })
  assert.equal(committed.state, "committed")
  assert.equal(committed.idempotent, false)
  assert.equal(adapter.ledger.filter((entry) => entry.action === "debited").length, 1)
})

test("an account cannot finalize another account's reservation", async () => {
  const { account, adapter, ledger } = createFixture("tenant-a@example.com", 2)
  adapter.seed("tenant-b@example.com", 2, 0)
  await ledger.reserve({ account, amount: 1, idempotencyKey: "shared-key" })

  await assert.rejects(
    ledger.commit({ account: "tenant-b@example.com", idempotencyKey: "shared-key" }),
    hasErrorCode("CREDIT_LEDGER_RESERVATION_NOT_FOUND"),
  )
  assert.deepEqual(adapter.snapshot("tenant-b@example.com"), {
    planCredits: 2,
    topupCredits: 0,
  })
})
