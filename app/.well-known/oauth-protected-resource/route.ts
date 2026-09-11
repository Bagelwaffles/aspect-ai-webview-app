import { NextResponse } from "next/server"

import {
  OVERMIND_OAUTH_ISSUER,
  OVERMIND_OAUTH_SCOPES,
  OVERMIND_OWNER_MCP_RESOURCE,
} from "@/lib/server/overmind-oauth"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json(
    {
      resource: OVERMIND_OWNER_MCP_RESOURCE,
      authorization_servers: [OVERMIND_OAUTH_ISSUER],
      scopes_supported: OVERMIND_OAUTH_SCOPES,
      bearer_methods_supported: ["header"],
      resource_name: "Aspect Overmind Owner Control",
    },
    { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
  )
}
