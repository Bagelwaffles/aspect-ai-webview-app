export type PlanSlug = "starter" | "growth" | "pro"

// One completed Content Agent generation consumes one credit. These bounded
// allocations are the single source of truth for pricing, entitlement resets,
// and Stripe subscription fulfillment.
const MONTHLY_PLAN_CREDITS: Readonly<Record<PlanSlug, number>> = {
  starter: 100,
  growth: 500,
  pro: 1500,
}

export function monthlyCreditsForPlan(plan: PlanSlug): number {
  return MONTHLY_PLAN_CREDITS[plan]
}
