/** A fail-closed host guard for ONE immutable PR #295 deployment URL, never the branch alias.
 * The dedicated Vercel deployment URL is provided by trusted system env VERCEL_URL.
 * The short-lived Vercel exception must NOT be added until independently testing this guard.
 */
const PILOT_BRANCH = "feat/audit-delivery-security-preview-20261023";
const PILOT_PATH = "/api/internal/quick-audit-pilot/webhook";

export function isDedicatedOwnerAuditPilotHost(hostname: string, env: NodeJS.ProcessEnv): boolean {
  // The feature switch is scoped by Vercel to the exact PR295 Preview Git branch.
  // Vercel may not expose optional VERCEL_URL / VERCEL_GIT_COMMIT_REF at runtime.
  if (env.AMS_QUICK_AUDIT_PILOT_IMMUTABLE_HOST_GUARD !== "true" ||
      (env.VERCEL_ENV && env.VERCEL_ENV !== "preview") ||
      (env.VERCEL_GIT_COMMIT_REF && env.VERCEL_GIT_COMMIT_REF !== PILOT_BRANCH)) return false;
  const host = hostname.toLowerCase();
  const deploymentHost = env.VERCEL_URL?.trim().toLowerCase();
  const branchHost = env.VERCEL_BRANCH_URL?.trim().toLowerCase();
  // Only generated immutable deployment URLs; excludes -git- branch aliases,
  // project production and all custom domains, even when system envs are absent.
  if (!/^aspect-ai-overlord-[a-z0-9]{7,14}-kimberleyaversbiz-4131s-projects\.vercel\.app$/.test(host) ||
      host === branchHost) return false;
  if (deploymentHost) {
    // If supplied by Vercel, its own immutable host must also match.
    return deploymentHost === host;
  }
  return true;
}

export function isPermittedOwnerAuditPilotPath(pathname: string): boolean {
  return pathname === PILOT_PATH;
}
