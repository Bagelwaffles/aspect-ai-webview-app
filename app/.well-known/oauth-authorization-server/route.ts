import { NextResponse } from "next/server"

import {
  OVERMIND_OAUTH_ISSUER,
  OVERMIND_OAUTH_SCOPES,
} from "@/lib/server/overmind-oauth"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json(
    {
      issuer: OVERMIND_OAUTH_ISSUER,
      authorization_endpoint: `${OVERMIND_OAUTH_ISSUER}/api/oauth/authorize`,
      token_endpoint: `${OVERMIND_OAUTH_ISSUER}/api/oauth/token`,
      registration_endpoint: `${OVERMIND_OAUTH_ISSUER}/api/oauth/register`,
      scopes_supported: OVERMIND_OAUTH_SCOPES,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      client_id_metadata_document_supported: false,
    },
    { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
  )
}
