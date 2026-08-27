import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import test from "node:test"

import { Redis } from "@upstash/redis"

import { customerSubjectFromProviderSubject } from "../lib/auth"
import { creditBalanceKeys } from "../lib/server/credit-ledger"
import {
  grantCreditTopupOnce,
  reconcileCreditTopupReversal,
} from "../lib/server/credit-topup-store"

const integrationEnabled = process.env.AMS_REDIS_INTEGRATION === "1"

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

test(
  "real Redis top-up grant and refund/dispute reconciliation are idempotent",
  { skip: integrationEnabled ? false : "set AMS_REDIS_INTEGRATION=1 to run" },
  async () => {
    const url = process.env.UPSTASH_REDIS_REST_URL?.trim()
    const token = (
      process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.AMS_STAGING_REDIS_REST_TOKEN
    )?.trim()
    assert.ok(url, "UPSTASH_REDIS_REST_URL is required")
    assert.ok(token, "a Redis REST token is required")

    const redis = new Redis({ url, token })
    const providerSubject = `credit-topup-redis-${randomUUID()}`
    const subjectCandidate = customerSubjectFromProviderSubject(providerSubject)
    assert.ok(subjectCandidate, "stable customer subject is required")
    const subject: string = subjectCandidate
    const checkoutSessionId = `cs_${randomUUID().replaceAll("-", "")}`
    const paymentIntentId = `pi_${randomUUID().replaceAll("-", "")}`
    const stripePriceId = `price_${randomUUID().replaceAll("-", "")}`
    const subjectHash = hash(subject)
    const sessionHash = hash(checkoutSessionId)
    const paymentIntentHash = hash(paymentIntentId)
    const balances = creditBalanceKeys(subject)
    const cleanupKeys = [
      balances.plan,
      balances.topup,
      balances.cycle,
      `ams:credits:topup-purchase:${sessionHash}`,
      `ams:credits:topup-payment:${paymentIntentHash}`,
      `ams:credits:ledger:${subjectHash}`,
    ]

    try {
      await redis.set(balances.plan, 100)
      await redis.set(balances.topup, 0)

      const grant = await grantCreditTopupOnce({
        subject,
        units: 300,
        checkoutSessionId,
        paymentIntentId,
        stripePriceId,
        stripeEventId: `evt_grant_${randomUUID().replaceAll("-", "")}`,
      })
      assert.equal(grant.applied, true)
      assert.equal(grant.idempotent, false)
      assert.equal(grant.topupCredits, 300)

      const grantReplay = await grantCreditTopupOnce({
        subject,
        units: 300,
        checkoutSessionId,
        paymentIntentId,
        stripePriceId,
        stripeEventId: `evt_grant_replay_${randomUUID().replaceAll("-", "")}`,
      })
      assert.equal(grantReplay.applied, false)
      assert.equal(grantReplay.idempotent, true)
      assert.equal(Number(await redis.get(balances.topup)), 300)

      const partialRefund = await reconcileCreditTopupReversal({
        subject,
        units: 300,
        paymentIntentId,
        stripeEventId: `evt_refund_${randomUUID().replaceAll("-", "")}`,
        source: "refund",
        targetUnits: 150,
      })
      assert.equal(partialRefund.applied, true)
      assert.equal(partialRefund.targetUnits, 150)
      assert.equal(partialRefund.withheldUnits, 150)
      assert.equal(partialRefund.unrecoveredUnits, 0)
      assert.equal(Number(await redis.get(balances.topup)), 150)
      assert.equal(Number(await redis.get(balances.plan)), 100)

      const dispute = await reconcileCreditTopupReversal({
        subject,
        units: 300,
        paymentIntentId,
        stripeEventId: `evt_dispute_${randomUUID().replaceAll("-", "")}`,
        source: "dispute",
        targetUnits: 300,
      })
      assert.equal(dispute.applied, true)
      assert.equal(dispute.targetUnits, 300)
      assert.equal(dispute.withheldUnits, 250)
      assert.equal(dispute.unrecoveredUnits, 50)
      assert.equal(Number(await redis.get(balances.topup)), 0)
      assert.equal(Number(await redis.get(balances.plan)), 0)

      const disputeWon = await reconcileCreditTopupReversal({
        subject,
        units: 300,
        paymentIntentId,
        stripeEventId: `evt_dispute_won_${randomUUID().replaceAll("-", "")}`,
        source: "dispute",
        targetUnits: 0,
      })
      assert.equal(disputeWon.applied, true)
      assert.equal(disputeWon.targetUnits, 150)
      assert.equal(disputeWon.withheldUnits, 150)
      assert.equal(disputeWon.unrecoveredUnits, 0)
      assert.equal(Number(await redis.get(balances.topup)), 100)
      assert.equal(Number(await redis.get(balances.plan)), 0)

      const refundReplay = await reconcileCreditTopupReversal({
        subject,
        units: 300,
        paymentIntentId,
        stripeEventId: `evt_refund_replay_${randomUUID().replaceAll("-", "")}`,
        source: "refund",
        targetUnits: 150,
      })
      assert.equal(refundReplay.applied, false)
      assert.equal(refundReplay.idempotent, true)
      assert.equal(refundReplay.targetUnits, 150)
      assert.equal(Number(await redis.get(balances.topup)), 100)
      assert.equal(Number(await redis.get(balances.plan)), 0)
    } finally {
      await redis.del(...cleanupKeys)
    }
  },
)
