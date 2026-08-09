# AMS owner session bridge

The owner login path uses Google/NextAuth for identity and a separate signed internal operator cookie for protected Command Center pages.

`GET /api/operator/session?next=/dashboard/...` performs the bridge in the Node runtime:

1. Validates the requested relative return path.
2. Requires an exact configured AMS owner email and valid internal session-signing secret.
3. Reads the signed Google/NextAuth session on the server.
4. Redirects unauthenticated users to the normal Google login flow, returning to the bridge afterward.
5. Rejects authenticated non-owner accounts.
6. Mints the existing `ams_internal_admin_access` operator cookie only for the exact configured owner.
7. Redirects to the requested protected dashboard route.

The legacy internal-admin password login remains an independent fallback and is not required for normal AMS owner access.
