/**
 * Transactional Quick Audit delivery outbox. The paid native result must already
 * exist before the caller may enqueue. This module never sends or grants OAuth.
 * Delivery is disabled until an approved, authenticated worker and sender exist.
 */
import { randomUUID } from "node:crypto"
import { Redis } from "@upstash/redis"

const TTL = 60 * 60 * 24 * 90
const KEY_PREFIX = "ams:quick-audit:delivery:"
export type AuditDeliveryState = "queued" | "sending" | "submitted" | "delivered" | "failed" | "uncertain"
export type AuditDeliveryRecord = {
  auditId: string
  requestId: string
  checkoutSessionId: string
  recipient: string
  state: AuditDeliveryState
  createdAt: string
  attemptId?: string
  providerMessageId?: string
  lastErrorCode?: string
}
export type OutboxRedis = {
  get<T=unknown>(key: string): Promise<T | null>
  set(key: string, value: string, options: { nx: true; ex: number }): Promise<unknown>
  eval(script: string, keys: string[], args: string[]): Promise<unknown>
}
function runtimeRedis(): OutboxRedis | null {
  const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)?.trim()
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)?.trim()
  return url && token ? new Redis({ url, token }) : null
}
function assertId(value: string, label: string) {
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(value)) throw new Error(`${label}_INVALID`)
}
function key(requestId: string) { assertId(requestId, "REQUEST_ID"); return KEY_PREFIX + requestId }
const CAS = "if redis.call('get',KEYS[1])==ARGV[1] then redis.call('set',KEYS[1],ARGV[2],'EX',ARGV[3]); return 1 end return 0"
export class QuickAuditDeliveryOutbox {
  constructor(private readonly redis: OutboxRedis | null = runtimeRedis()) {}
  private client() { if (!this.redis) throw new Error("QUICK_AUDIT_DELIVERY_STORE_UNAVAILABLE"); return this.redis }
  async read(requestId: string): Promise<AuditDeliveryRecord | null> {
    const raw = await this.client().get<unknown>(key(requestId))
    if (!raw) return null
    const item: AuditDeliveryRecord = typeof raw === "string" ? JSON.parse(raw) : raw as AuditDeliveryRecord
    if (item.requestId !== requestId) throw new Error("QUICK_AUDIT_DELIVERY_RECORD_CORRUPT")
    return item
  }
  /** Only a caller that independently verified the settled payment and durable result may enqueue. */
  async enqueue(input: {auditId:string; requestId:string; checkoutSessionId:string; recipient:string; paidAndPersisted:boolean}): Promise<AuditDeliveryRecord> {
    if (!input.paidAndPersisted) throw new Error("QUICK_AUDIT_DELIVERY_NOT_VERIFIED")
    for (const [label,id] of [["AUDIT_ID",input.auditId],["SESSION_ID",input.checkoutSessionId]] as const) assertId(id,label)
    const recipient=input.recipient.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || recipient.length > 254) throw new Error("QUICK_AUDIT_DELIVERY_RECIPIENT_INVALID")
    const record: AuditDeliveryRecord={auditId:input.auditId,requestId:input.requestId,checkoutSessionId:input.checkoutSessionId,recipient,state:"queued",createdAt:new Date().toISOString()}
    const created=await this.client().set(key(input.requestId),JSON.stringify(record),{nx:true,ex:TTL})
    if (created === "OK" || created === true) return record
    const existing=await this.read(input.requestId)
    if (!existing || existing.auditId !== record.auditId || existing.checkoutSessionId !== record.checkoutSessionId || existing.recipient !== record.recipient) throw new Error("QUICK_AUDIT_DELIVERY_CONFLICT")
    return existing
  }
  /** A default-off worker may claim ONE known paid audit; never silently retry uncertainty. */
  async claim(requestId:string, flags:{enabled:boolean; ownerOnly:boolean; ownerEmail:string}): Promise<AuditDeliveryRecord | null> {
    if (!flags.enabled) throw new Error("QUICK_AUDIT_DELIVERY_DISABLED")
    const original=await this.read(requestId)
    if (!original || original.state !== "queued") return null
    if (flags.ownerOnly && original.recipient !== flags.ownerEmail.trim().toLowerCase()) throw new Error("QUICK_AUDIT_DELIVERY_OWNER_ONLY")
    const next: AuditDeliveryRecord={...original,state:"sending",attemptId:randomUUID()}
    const ok=await this.client().eval(CAS,[key(requestId)],[JSON.stringify(original),JSON.stringify(next),String(TTL)])
    return Number(ok)===1?next:null
  }
  /** Store definite send outcome; a network timeout stays uncertain and never auto-retries. */
  async finish(claim:AuditDeliveryRecord,outcome:{state:"submitted"|"delivered"|"failed"|"uncertain";providerMessageId?:string;code?:string}):Promise<boolean> {
    if (claim.state!=="sending" || !claim.attemptId) throw new Error("QUICK_AUDIT_DELIVERY_CLAIM_INVALID")
    const updated:AuditDeliveryRecord={...claim,state:outcome.state,providerMessageId:outcome.providerMessageId,lastErrorCode:outcome.code}
    return Number(await this.client().eval(CAS,[key(claim.requestId)],[JSON.stringify(claim),JSON.stringify(updated),String(TTL)]))===1
  }
}
