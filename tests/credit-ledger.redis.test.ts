import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import test from "node:test"

import { Redis } from "@upstash/redis"

import {
  CreditLedger,
  UpstashCreditLedgerAdapter,
  creditBalanceKeys,
} from "../lib/server/credit-ledger"
import { UpstashStripeEntitlementWriter } from "../lib/server/stripe-entitlements"

const integrationEnabled = process.env.AMS_REDIS_INTEGRATION === "1"

test(
  "real Redis refund restores top-ups but not plan credits from a prior billing cycle",
  { skip: integrationEnabled ? false : "set AMS_REDIS_INTEGRATION=1 to run" },
  async () => {
    const url = process.env.UPSTASH_REDIS_REST_URL?.trim()
    const token = (
      process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.AMS_STAGING_REDIS_REST_TOKEN
    )?.trim()
    assert.ok(url, "UPSTASH_REDIS_REST_URL is required")
    assert.ok(token, "a Redis REST token is required")

    const redis = new Redis({ url, token })
    const account = `customer:google:${createHash("sha256").update(randomUUID()).digest("hex")}`
    const billingEmail = `credit-cycle-${randomUUID()}@example.test`
    const idempotencyKey = `cycle-race-${randomUUID()}`
    const accountHash = createHash("sha256").update(account).digest("hex")
    const idempotencyHash = createHash("sha256").update(idempotencyKey).digest("hex")
    const balanceKeys = creditBalanceKeys(account)
    const reservationKey = `ams:credits:reservation:${accountHash}:${idempotencyHash}`
    const ledgerKey = `ams:credits:ledger:${accountHash}`
    const subscriptionId = `sub_${randomUUID().replaceAll("-", "")}`
    const profileKey = `ams:entitlements:profile:${account}`
    const ownerKey = `ams:stripe:subscription-owner:${subscriptionId}`
    const cleanupKeys = [
      balanceKeys.plan,
      balanceKeys.topup,
      balanceKeys.cycle,
      reservationKey,
      ledgerKey,
      profileKey,
      ownerKey,
    ]

    try {
      const entitlementWriter = new UpstashStripeEntitlementWriter(redis)
      await entitlementWriter.apply({
        subject: account,
        billingEmail,
        plan: "starter",
        subscriptionStatus: "active",
        stripeCustomerId: `cus_${randomUUID().replaceAll("-", "")}`,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: "price_staging_starter",
        stripeEventId: `evt_${randomUUID().replaceAll("-", "")}`,
        stripeEventCreated: 100,
        stripeSubscriptionCreated: 50,
        billingCycleKey: `${subscriptionId}:100`,
        resetPlanCredits: true,
      })

      assert.equal(await redis.get(balanceKeys.cycle), `${subscriptionId}:100`)
      await redis.set(balanceKeys.plan, 2)
      await redis.set(balanceKeys.topup, 2)

      const ledger = new CreditLedger(new UpstashCreditLedgerAdapter(redis))
      await ledger.reserve({ account, amount: 3, idempotencyKey })

      assert.equal(Number(await redis.get(balanceKeys.plan)), 0)
      assert.equal(Number(await redis.get(balanceKeys.topup)), 1)

      await entitlementWriter.apply({
        subject: account,
        billingEmail,
        plan: "starter",
        subscriptionStatus: "active",
        stripeCustomerId: `cus_${randomUUID().replaceAll("-", "")}`,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: "price_staging_starter",
        stripeEventId: `evt_${randomUUID().replaceAll("-", "")}`,
        stripeEventCreated: 200,
        stripeSubscriptionCreated: 50,
        billingCycleKey: `${subscriptionId}:200`,
        resetPlanCredits: true,
      })
      assert.equal(await redis.get(balanceKeys.cycle), `${subscriptionId}:200`)

      const refunded = await ledger.refund({ account, idempotencyKey })
      assert.equal(refunded.state, "refunded")
      assert.equal(Number(await redis.get(balanceKeys.plan)), 2_000)
      assert.equal(Number(await redis.get(balanceKeys.topup)), 2)

      const replay = await ledger.refund({ account, idempotencyKey })
      assert.equal(replay.idempotent, true)
      assert.equal(Number(await redis.get(balanceKeys.plan)), 2_000)
      assert.equal(Number(await redis.get(balanceKeys.topup)), 2)
    } finally {
      await redis.del(...cleanupKeys)
    }
  },
)
