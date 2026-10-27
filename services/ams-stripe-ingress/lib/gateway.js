import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export const SANDBOX_ACCOUNT = 'acct_1UTtFMGuhFCl8JHa'
export const SESSION_ID = 'cs_test_a1tkmuuIstdaF0nqCzyMzyQ9vYa6FdZ4IG2JhEdxBKbbKXAQKtEbzEc4R1'
const WEBHOOK_PATH = '/api/stripe-webhook'
const MAX_BYTES = 256_000
const RETENTION_SECONDS = 90 * 24 * 3600
const RETRY_CODE = 'PILOT_FULFILLMENT_NOT_ENABLED'
const isolatedDbHost = 'internal-chicken-238070.upstash.io'

function answer(status, code, extra = {}) {
  return Response.json({ ok: false, code, fulfillmentEnabled: false, sendEnabled: false, ...extra }, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' },
  })
}

export function windowOpen(env, nowMs = Date.now()) {
  const deadline = Date.parse(env.AMS_GATEWAY_INTAKE_UNTIL || '')
  return env.VERCEL_ENV === 'preview' &&
    env.AMS_GATEWAY_INTAKE_ENABLED === 'true' &&
    env.AMS_GATEWAY_ACCOUNT_ID === SANDBOX_ACCOUNT &&
    env.AMS_GATEWAY_SESSION_ID === SESSION_ID &&
    Number.isFinite(deadline) && deadline > nowMs && deadline - nowMs <= 10 * 60_000
}

/**
 * One separate, exact-session TEST audit handoff window. The original
 * historical receipt-only proof remains unchanged and is NOT eligible.
 * No email or fulfillment runs in this standalone Stripe receiver.
 */
export function auditHandoffWindowOpen(env, nowMs = Date.now()) {
  const deadline = Date.parse(env.AMS_GATEWAY_INTAKE_UNTIL || '')
  const owner = String(env.AMS_GATEWAY_AUDIT_OWNER_EMAIL || '').trim().toLowerCase()
  return env.VERCEL_ENV === 'preview' &&
    env.AMS_GATEWAY_INTAKE_ENABLED === 'true' &&
    env.AMS_GATEWAY_AUDIT_HANDOFF_ENABLED === 'true' &&
    env.AMS_GATEWAY_ACCOUNT_ID === SANDBOX_ACCOUNT &&
    /^cs_test_[A-Za-z0-9]{8,200}$/.test(env.AMS_GATEWAY_SESSION_ID || '') &&
    env.AMS_GATEWAY_SESSION_ID !== SESSION_ID &&
    /^[A-Za-z0-9_-]{16,80}$/.test(env.AMS_GATEWAY_AUDIT_RUN_ID || '') &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner) &&
    Number.isFinite(deadline) && deadline > nowMs && deadline - nowMs <= 10 * 60_000
}

export function configReady(env) {
  try {
    if (!env.AMS_GATEWAY_WEBHOOK_SECRET?.startsWith('whsec_') ||
        env.AMS_GATEWAY_WEBHOOK_SECRET.length < 20 ||
        !env.AMS_GATEWAY_REDIS_REST_TOKEN?.trim() ||
        env.AMS_GATEWAY_REDIS_NAMESPACE !== 'ams:preview:stripe-gateway:pr300:' ||
        env.AMS_GATEWAY_REDIS_REST_URL !== 'https://' + isolatedDbHost) return false
    const url = new URL(env.AMS_GATEWAY_REDIS_REST_URL)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      url.pathname === '/' && !url.search && !url.hash
  } catch { return false }
}

export function verifySignature(raw, header, secret, nowSeconds = Math.floor(Date.now()/1000)) {
  if (!header || !secret || !secret.startsWith('whsec_')) return false
  const kv = header.split(',').map(x => x.trim())
  const tsPart = kv.find(x => /^t=\d{10,12}$/.test(x))
  const ts = tsPart ? Number(tsPart.slice(2)) : NaN
  if (!Number.isSafeInteger(ts) || Math.abs(nowSeconds - ts) > 300) return false
  const signatures = kv.filter(x => /^v1=[a-fA-F0-9]{64}$/.test(x))
  if (!signatures.length) return false
  const expected = createHmac('sha256',secret)
    .update(Buffer.from(String(ts) + '.', 'utf8')).update(raw).digest()
  return signatures.some(s => {
    const sig = Buffer.from(s.slice(3), 'hex')
    return sig.length === expected.length && timingSafeEqual(sig, expected)
  })
}

async function redisCommand(env, command, fetchFn) {
  const response = await fetchFn(env.AMS_GATEWAY_REDIS_REST_URL, {
    method: 'POST', headers: { Authorization: 'Bearer ' + env.AMS_GATEWAY_REDIS_REST_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(command), signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) throw Error('isolated redis unavailable')
  const result = await response.json()
  if (result.error) throw Error('isolated redis operation rejected')
  return result.result
}

export async function receive(request, { env = process.env, nowMs = Date.now(), fetchFn = fetch } = {}) {
  if (request.method !== 'POST') return answer(405, 'POST_ONLY')
  const url = new URL(request.url)
  if (url.pathname !== WEBHOOK_PATH || url.search) return answer(404, 'ROUTE_DENIED')
  const handoff = auditHandoffWindowOpen(env, nowMs)
  if (!handoff && !windowOpen(env, nowMs)) return answer(503, 'PILOT_RECEIPT_ONLY_WINDOW_CLOSED')
  if (!configReady(env)) return answer(503, 'PILOT_INGRESS_NOT_CONFIGURED')
  const length = Number(request.headers.get('content-length') || '0')
  if (Number.isFinite(length) && length > MAX_BYTES) return answer(413, 'PILOT_PAYLOAD_TOO_LARGE')
  const raw = Buffer.from(await request.arrayBuffer())
  if (!raw.length || raw.length > MAX_BYTES) return answer(413, 'PILOT_PAYLOAD_INVALID')
  if (!verifySignature(raw, request.headers.get('stripe-signature'), env.AMS_GATEWAY_WEBHOOK_SECRET, Math.floor(nowMs/1000))) {
    return answer(400, 'PILOT_SIGNATURE_INVALID')
  }
  let event
  try { event = JSON.parse(raw.toString('utf8')) } catch { return answer(400, 'PILOT_JSON_INVALID') }
  if (!/^evt_[A-Za-z0-9]{8,200}$/.test(event?.id || '') || event?.livemode !== false ||
      (event.account && event.account !== SANDBOX_ACCOUNT)) {
    return answer(403, 'PILOT_EVENT_SCOPE_DENIED')
  }
  if (event.type !== 'checkout.session.completed') return answer(403, 'PILOT_EVENT_TYPE_DENIED')
  const session = event.data?.object
  const expectedSession = handoff ? env.AMS_GATEWAY_SESSION_ID : SESSION_ID
  if (session?.object !== 'checkout.session' || session.id !== expectedSession || session.livemode !== false ||
      session.mode !== 'payment' || session.status !== 'complete' || session.payment_status !== 'paid' ||
      session.amount_total !== 4900 || session.currency !== 'usd') {
    return answer(403, 'PILOT_CHECKOUT_SCOPE_DENIED')
  }
  if (handoff) {
    const md = session.metadata || {}
    const owner = String(env.AMS_GATEWAY_AUDIT_OWNER_EMAIL).trim().toLowerCase()
    if (md.ams_offer !== 'quick-marketing-audit' ||
        md.ams_preview_run_id !== env.AMS_GATEWAY_AUDIT_RUN_ID ||
        !/^quick-audit-[a-f0-9]{32}$/.test(md.ams_request_id || '') ||
        md.ams_business_name !== 'Aspect Marketing Solutions' ||
        md.ams_website_url !== 'https://www.aspectmarketingsolutions.app' ||
        md.ams_industry !== 'Marketing automation' ||
        md.ams_goals !== 'Check real paid TEST fulfillment and branded owner-only report delivery' ||
        String(session.customer_details?.email || '').toLowerCase() !== owner) {
      return answer(403, 'PILOT_AUDIT_METADATA_DENIED')
    }
  }
  const hash = createHash('sha256').update(raw).digest('hex')
  // No raw Stripe payload, signing key, signature or customer email is stored.
  const receipt = {
    id:event.id, type:event.type, digest:hash, livemode:false,
    checkoutSessionId:expectedSession, recordedAt:new Date(nowMs).toISOString(),
    ...(handoff ? {
      kind:'signed-owner-audit-v1', account:SANDBOX_ACCOUNT,
      requestId:session.metadata.ams_request_id,
      runId:env.AMS_GATEWAY_AUDIT_RUN_ID,
    } : {}),
  }
  const key = env.AMS_GATEWAY_REDIS_NAMESPACE + 'event:' + event.id
  try {
    const result = await redisCommand(env,['SET',key,JSON.stringify(receipt),'EX',RETENTION_SECONDS,'NX'],fetchFn)
    if (result !== 'OK') {
      const existing = await redisCommand(env,['GET',key],fetchFn)
      const current = typeof existing === 'string' ? JSON.parse(existing) : existing
      if (current?.id !== receipt.id || current.digest !== receipt.digest) return answer(409,'PILOT_EVENT_COLLISION')
      return answer(503,RETRY_CODE,{ duplicate:true })
    }
    // Deliberately non-2xx: no payment fulfillment has been performed.
    return answer(503,RETRY_CODE,{ receiptRecorded:true })
  } catch { return answer(503,'PILOT_RECEIPT_STORE_UNAVAILABLE') }
}
