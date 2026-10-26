import { isContentAgentLaunchEnabled } from "@/lib/content-agent-launch"
import { isAgentRuntimeConfigured } from "@/lib/server/agent-runtime"

/**
 * New paid subscriptions require explicit server-side owner activation,
 * an enabled release, and an available AI runtime. Do not open Stripe checkout when the runtime has been shut off:
 * a successful payment cannot fulfill the advertised agent generations then.
 *
 * This gate defaults CLOSED until AMS_SUBSCRIPTION_CHECKOUT_ENABLED=true.
 * Configuration alone does not prove live provider readiness.
 * Real provider and billing fulfillment still require launch verification.
 */
export function isSubscriptionCheckoutAvailable(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.AMS_SUBSCRIPTION_CHECKOUT_ENABLED?.trim().toLowerCase() === "true" &&
    isContentAgentLaunchEnabled(env) && isAgentRuntimeConfigured(env)
}
