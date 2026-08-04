export const CONTENT_AGENT_LAUNCH_ENV = "NEXT_PUBLIC_AMS_CONTENT_AGENT_LIVE" as const

/**
 * Paid Content Agent execution is opt-in. Missing, malformed, or false values
 * keep the launch candidate in the zero-cost, provider-disabled state.
 */
export function isContentAgentLaunchEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AMS_CONTENT_AGENT_LIVE?.trim().toLowerCase() === "true"
}
