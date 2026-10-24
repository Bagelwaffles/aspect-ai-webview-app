/**
 * Explicit sandbox-only store wiring. No singleton/default Redis and no
 * production Redis fallback. One physically separate instance backs all
 * state transitions (payment proof, result, event receipts, durable outbox).
 *
 * This is a factory, NOT a dispatcher, checkout route or automatic send.
 * Actual database identity and least-privilege credentials must be verified
 * by the owner before the intake feature switch is enabled.
 */
import { Redis } from "@upstash/redis"

import { RedisQuickAuditStore } from "./quick-audit-fulfillment"
import { RedisQuickAuditResultStore, createNativeQuickAuditAuditGateway } from "./quick-audit-native"
import { QuickAuditDeliveryOutbox } from "./quick-audit-delivery-outbox"
import { RedisPaidQuickAuditProof } from "./quick-audit-delivery-worker"
import { pilotIntakeConfiguration, pilotDispatchConfiguration, pilotFulfillmentConfiguration } from "./quick-audit-isolated-stripe-pilot"

export function createIsolatedPilotStores(
  env: NodeJS.ProcessEnv = process.env,
  injectedRedis?: Redis,
  mode: "intake" | "dispatch" | "fulfillment" = "intake",
) {
  // Guard BEFORE constructing or reading any Redis client. The applicant's
  // default URL and the previously approved shared Upstash proof database
  // are forbidden for payment/customer data.
  const gate = mode === "dispatch" ? pilotDispatchConfiguration(env) :
    mode === "fulfillment" ? pilotFulfillmentConfiguration(env) : pilotIntakeConfiguration(env)
  if (!gate.ready) {
    return null
  }

  const redis = injectedRedis ?? new Redis({
    url: env.AMS_STRIPE_PILOT_REDIS_REST_URL!,
    token: env.AMS_STRIPE_PILOT_REDIS_REST_TOKEN!,
  })

  const results = new RedisQuickAuditResultStore(redis)
  return {
    eventReceipts: redis,
    payment: new RedisQuickAuditStore(redis),
    paymentProof: new RedisPaidQuickAuditProof(redis),
    reports: results,
    outbox: new QuickAuditDeliveryOutbox(redis),
    auditGateway: createNativeQuickAuditAuditGateway({ store: results }),
  }
}
