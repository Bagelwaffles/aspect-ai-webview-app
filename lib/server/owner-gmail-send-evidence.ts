import { z } from "zod"
import type { GmailRedis } from "./owner-gmail"

const TTL_SECONDS = 30 * 86400
const proofSchema = z.object({
  grantConnectedAt: z.string().datetime(),
  receiptVerifiedAt: z.string().datetime(),
}).strict()

/**
 * Non-sensitive confirmation of an existing Gmail inbox receipt. This is NOT
 * proof of a customer-facing auto acknowledgement or future send capability.
 * An OAuth reconnection invalidates this evidence by changing connectedAt.
 */
export async function saveOwnerAlertReceiptProof(
  redis: GmailRedis, prefix: string, grantConnectedAt: string, now = new Date(),
) {
  const proof = proofSchema.parse({
    grantConnectedAt,
    receiptVerifiedAt: now.toISOString(),
  })
  await redis.set(prefix + "owner-alert-receipt-proof", JSON.stringify(proof), { ex: TTL_SECONDS })
  return proof.receiptVerifiedAt
}

export async function readOwnerAlertReceiptProof(
  redis: GmailRedis, prefix: string, grantConnectedAt: string, now = new Date(),
): Promise<string | null> {
  const raw = await redis.get<string>(prefix + "owner-alert-receipt-proof")
  const parsed = proofSchema.safeParse(typeof raw === "string" ? JSON.parse(raw) : raw)
  if (!parsed.success || parsed.data.grantConnectedAt !== grantConnectedAt) return null
  const at = Date.parse(parsed.data.receiptVerifiedAt)
  if (at > now.getTime() + 60_000 || at <= now.getTime() - TTL_SECONDS * 1000) return null
  return parsed.data.receiptVerifiedAt
}
