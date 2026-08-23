export const CONTENT_AGENT_LAUNCH_ENV = "NEXT_PUBLIC_AMS_CONTENT_AGENT_LIVE" as const

/**
 * Production execution is enabled by the application release itself. The old
 * public launch flag remains useful for non-production previews and local
 * development, while the server-side AMS_AGENT_RUNTIME_DISABLED kill switch
 * can still stop provider execution in production without exposing a secret.
 */
export function isContentAgentLaunchEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === "production") return true
  return env.NEXT_PUBLIC_AMS_CONTENT_AGENT_LIVE?.trim().toLowerCase() === "true"
}
