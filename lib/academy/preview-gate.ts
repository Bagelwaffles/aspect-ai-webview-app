/**
 * Fail-closed admission for the unfinished Academy pilot.
 *
 * The flag alone can never open a Production Vercel deployment.
 * Local development can opt in, but a non-preview Vercel environment cannot.
 */
export type AcademyGateEnvironment = {
  AMS_ACADEMY_PREVIEW_ENABLED?: string
  VERCEL_ENV?: string
  NODE_ENV?: string
}

export function isAcademyPreviewEnabled(
  env: AcademyGateEnvironment = process.env,
): boolean {
  if (env.AMS_ACADEMY_PREVIEW_ENABLED !== "true") return false

  // Preview builds run with NODE_ENV=production on Vercel.
  if (env.VERCEL_ENV === "preview") return true

  // Fail closed even when NODE_ENV has been accidentally misconfigured.
  return !env.VERCEL_ENV && env.NODE_ENV === "development"
}
