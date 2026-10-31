/**
 * Protected owner-Preview proof store for independent Resend domain checks.
 * NO public endpoint, background task, secret storage, or provider send.
 *
 * Caller must authenticate the owner, supply an isolated Preview Redis client,
 * and use a namespace dedicated to the Preview test. The mail sender is
 * read-only; the administrative verifier is used only by an isolated owner
 * maintenance invocation, never by the mail dispatcher.
 */
import {
  inspectResendDomainForOwner,
  hasCurrentResendDomainProof,
  AMS_RESEND_DOMAIN_ID,
  type ResendVerifiedDomainProof,
} from "./quick-audit-resend-domain-proof"

export interface ResendDomainProofRedis {
  get<T = unknown>(key: string): Promise<T | null>
  set(key: string, value: string, options: { ex: number }): Promise<unknown>
}

export class PreviewResendDomainProofStore {
  private readonly key: string
  constructor(
    private readonly redis: ResendDomainProofRedis,
    namespace: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    // No shared production/default namespace, and no keys derived from
    // recipient emails or other user input.
    if (!/^ams:preview:quick-audit:[a-z0-9-]{8,80}:$/u.test(namespace)) {
      throw new Error("AMS_RESEND_PROOF_PREVIEW_NAMESPACE_REQUIRED")
    }
    this.key = `${namespace}resend-domain-proof:${AMS_RESEND_DOMAIN_ID}`
  }

  async readDomainProof(): Promise<ResendVerifiedDomainProof | null> {
    const raw = await this.redis.get<unknown>(this.key)
    let value: unknown = raw
    if (typeof raw === "string") {
      try { value = JSON.parse(raw) } catch { return null }
    }
    return hasCurrentResendDomainProof(value, this.now())
      ? value
      : null
  }

  /** This must never be called by the send-only worker. */
  async saveOwnerVerifiedProof(proof: ResendVerifiedDomainProof): Promise<void> {
    if (!hasCurrentResendDomainProof(proof, this.now())) {
      throw new Error("AMS_RESEND_PROOF_EXPIRED_OR_INVALID")
    }
    await this.redis.set(this.key, JSON.stringify(proof), { ex: 15 * 60 })
  }
}

/**
 * One-time owner-only administrative maintenance operation. It is not a
 * route and cannot run from the sending adapter. The full-access token comes
 * from the temporary approved owner verifier, never from Vercel sending env.
 */
export async function verifyAndRecordResendDomainForOwner(input: {
  fullAccessKey: string
  env: NodeJS.ProcessEnv
  proofStore: PreviewResendDomainProofStore
  fetcher?: typeof fetch
  now?: Date
}): Promise<boolean> {
  if (input.env.VERCEL_ENV !== "preview") {
    throw new Error("AMS_RESEND_PROOF_PREVIEW_ONLY")
  }
  const proof = await inspectResendDomainForOwner({
    fullAccessKey: input.fullAccessKey,
    fetcher: input.fetcher,
    now: input.now,
  })
  if (!proof) return false
  await input.proofStore.saveOwnerVerifiedProof(proof)
  return true
}
