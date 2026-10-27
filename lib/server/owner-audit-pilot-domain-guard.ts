/** A fail-closed host guard for ONE immutable PR #295 deployment URL, never the branch alias.
 * The dedicated Vercel deployment URL is provided by trusted system env VERCEL_URL.
 * The short-lived Vercel exception must NOT be added until independently testing this guard.
 */
const PILOT_BRANCH = "feat/audit-delivery-security-preview-20261023";
const PILOT_PATH = "/api/internal/quick-audit-pilot/webhook";

export function isDedicatedOwnerAuditPilotHost(hostname: string, env: NodeJS.ProcessEnv): boolean {
  if (env.AMS_QUICK_AUDIT_PILOT_IMMUTABLE_HOST_GUARD !== "true" ||
      env.VERCEL_ENV !== "preview" ||
      env.VERCEL_GIT_COMMIT_REF !== PILOT_BRANCH) return false;
  const deploymentHost = env.VERCEL_URL?.trim().toLowerCase();
  const branchHost = env.VERCEL_BRANCH_URL?.trim().toLowerCase();
  if (!deploymentHost || !deploymentHost.endsWith(".vercel.app") ||
      deploymentHost.includes("://") || deploymentHost.includes("/") ||
      deploymentHost.includes(":") || deploymentHost.startsWith(".") ||
      deploymentHost === branchHost) return false;
  return hostname.toLowerCase() === deploymentHost;
}

export function isPermittedOwnerAuditPilotPath(pathname: string): boolean {
  return pathname === PILOT_PATH;
}
