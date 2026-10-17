import { isContentAgentLaunchEnabled } from "@/lib/content-agent-launch"
import { isAgentRuntimeConfigured } from "@/lib/server/agent-runtime"

/**
 * New paid subscriptions require both an enabled release and an available
 * AI runtime. Do not open Stripe checkout when the runtime has been shut off:
 * a successful payment cannot fulfill the advertised agent generations then.
 *
 * This is a configuration gate, not proof of upstream provider availability.
 * Real provider runs and Stripe fulfillment still require launch verification.
 */
export function isSubscriptionCheckoutAvailable(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isContentAgentLaunchEnabled(env) && isAgentRuntimeConfigured(env)
}
