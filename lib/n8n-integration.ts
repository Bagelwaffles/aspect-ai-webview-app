Totally
right
—and
for your stack (self-hosted n8n at flow.aspectmarketingsolutions.app), here’s
the
concise, v0 - ready
version.
\
n8n auth model (
for VO.app)
\
You don’t use API keys. You expose Webhook triggers and protect them.
\
Use a shared header secret (simple, reliable) and optionally add timestamp + signature
for replay protection.
\
ENV
you
actually
need
\
N8N_BASE_URL=https://flow.aspectmarketingsolutions.app
N8N_WEBHOOK_PATH=/webhook/vo-app
N8N_WEBHOOK_SECRET=YOUR_LONG_RANDOM

Next.js → n8n (server-only)
// lib/n8n.ts
import crypto from "crypto"
export async function callN8N(action: string, payload: unknown = {}) {
  const base = process.env.N8N_BASE_URL!
  const path = process.env.N8N_WEBHOOK_PATH!
  const secret = process.env.N8N_WEBHOOK_SECRET!
  const body = JSON.stringify({ action, ...payload })
  const ts = Math.floor(Date.now() / 1000).toString()
  const sig = crypto.createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex")

  const res = await fetch(`${base}${path}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      "x-vo-secret": secret, // simple header auth
      "x-vo-timestamp": ts, // replay guard
      "x-vo-signature": sig, // optional HMAC check
    },
    body,
  })
  if (!res.ok) throw new Error(`n8n ${action} failed: ${res.status} ${await res.text()}`)
  return res.json().catch(() => ({}))
}
\
n8n workflow (Webhook security)

Webhook node

Path: /webhook/vo-app

Method: POST

Authentication: Header Auth

Header Name: x-vo-secret

Header Value: $
{
  env: N8N_WEBHOOK_SECRET
}
\
(Optional) Crypto node + IF node to verify HMAC:

Compute sha256 HMAC of
{
  $json["x-vo-timestamp"]
}
+ ".\" + {{$json[\"bodyRaw\"]}} using ${env:N8N_WEBHOOK_SECRET}
\
Compare to header x-vo-signature

Function/IF node to check timestamp:

const ts = Number($json.headers["x-vo-timestamp"])
if (!ts || Math.abs(Date.now() - ts * 1000) > 60 * 1000) {
  $response.statusCode = 401
  return [{ error: "stale" }];
}
return items;

\
Then Switch on
{
  $json.body.action
}
to
your
agents:
\

printify.shops.list

printify.upload

printify.products.create

printify.products.publish

billing.checkout.completed (from Stripe webhook via your app)
\
Note:
if you want
only
the
simple
path, you
can
skip
signature / timestamp
and
rely
on
“Header Auth” alone.

Quick smoke tests
# 1) App health
curl -s https://vo.aspectmarketingsolutions.app/api/health

# 2) Direct n8n (bypasses app) – replace SECRET
curl -s -X POST https://flow.aspectmarketingsolutions.app/webhook/vo-app \
  -H "content-type: application/json" \
  -H "x-vo-secret: YOUR_LONG_RANDOM" \
  -d '{"action":"printify.shops.list"}'

Good to know

Keep all n8n secrets as Environment Variables in n8n and reference as $
{
  env: ...
}
.
\
Do not expose N8N_WEBHOOK_SECRET to the browser
call
callN8N
from
server
routes
only.
\
\
You already have the right base URL/path—no need
for n8n Cloud in your
case.\
