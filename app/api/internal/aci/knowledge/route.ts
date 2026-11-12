import { NextRequest } from "next/server"

import {
  handleAciKnowledgeGet,
  handleAciKnowledgePost,
} from "@/lib/server/aci-knowledge-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  return handleAciKnowledgeGet(request)
}

export async function POST(request: NextRequest) {
  return handleAciKnowledgePost(request)
}
