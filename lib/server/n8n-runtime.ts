export function isN8nExecutionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV !== "production") return true
  return env.AMS_N8N_ENABLED?.trim().toLowerCase() === "true"
}
