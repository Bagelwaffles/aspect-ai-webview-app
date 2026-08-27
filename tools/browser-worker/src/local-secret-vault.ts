import { randomUUID } from "node:crypto"

const DEFAULT_TTL_MS = 15 * 60_000
const MAX_SECRET_CHARS = 32_768
const HANDLE_PREFIX = "ams-secret-"

type SecretRecord = {
  value: string
  expiresAt: number
  usesRemaining: number
}

export class LocalSecretVault {
  private readonly records = new Map<string, SecretRecord>()

  constructor(private readonly ttlMs = DEFAULT_TTL_MS) {}

  capture(rawValue: string, uses = 3): string {
    const value = rawValue.trim()
    if (!value) throw new Error("SECRET_VALUE_EMPTY")
    if (value.length > MAX_SECRET_CHARS) throw new Error("SECRET_VALUE_TOO_LARGE")
    if (!Number.isInteger(uses) || uses < 1 || uses > 10) throw new Error("SECRET_USE_COUNT_INVALID")

    this.prune()
    const handle = `${HANDLE_PREFIX}${randomUUID()}`
    this.records.set(handle, {
      value,
      expiresAt: Date.now() + this.ttlMs,
      usesRemaining: uses,
    })
    return handle
  }

  resolve(handle: string): string {
    this.prune()
    const record = this.records.get(handle)
    if (!record) throw new Error("SECRET_HANDLE_INVALID_OR_EXPIRED")

    record.usesRemaining -= 1
    if (record.usesRemaining <= 0) this.records.delete(handle)
    else this.records.set(handle, record)
    return record.value
  }

  revoke(handle: string): void {
    this.records.delete(handle)
  }

  clear(): void {
    this.records.clear()
  }

  isHandle(value: string): boolean {
    return value.startsWith(HANDLE_PREFIX)
  }

  size(): number {
    this.prune()
    return this.records.size
  }

  private prune(): void {
    const now = Date.now()
    for (const [handle, record] of this.records) {
      if (record.expiresAt <= now) this.records.delete(handle)
    }
  }
}

export const SECRET_HANDLE_PREFIX = HANDLE_PREFIX
