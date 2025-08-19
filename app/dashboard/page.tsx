"use client"

import { useEffect, useState } from "react"

type Status = { ok: boolean; n8n?: any; error?: string; target?: string }

const WORKFLOW_JSON = `{
  "name": "VO.app — Webhook + Relevance + Credits (+add)",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "vo-app",
        "authentication": "headerAuth",
        "headerParameters": { "entries": [ { "name": "x-vo-secret", "value": "={{$env.N8N_WEBHOOK_SECRET}}" } ] },
        "respond": "responseNode",
        "options": { "responseHeaders": { "entries": [ { "name": "content-type", "value": "application/json" } ] } }
      },
      "id": "Webhook",
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [-1120, -40]
    }
  ],
  "connections": {},
  "settings": { "executionOrder": "v1" },
  "staticData": {},
  "version": 2,
  "active": false,
  "meta": { "instanceId": "vo-app" }
}`

const HEALTH_WORKFLOW_JSON = `{
  "name": "VO.app — Health",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "GET",
        "path": "health",
        "respond": "responseNode",
        "options": {
          "responseHeaders": { "entries": [ { "name": "content-type", "value": "application/json" } ] }
        }
      },
      "id": "Webhook",
      "name": "Webhook /health (public)",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [-320, 0]
    },
    {
      "parameters": {
        "functionCode": "return [{ json: {\\n  ok: true,\\n  service: 'n8n',\\n  ts: new Date().toISOString(),\\n  note: 'public health endpoint'\\n}}];"
      },
      "id": "Code",
      "name": "Code → JSON",
      "type": "n8n-nodes-base.function",
      "typeVersion": 2,
      "position": [-120, 0]
    },
    {
      "parameters": {
        "responseBody": "={{$json}}",
        "responseCode": 200
      },
      "id": "Respond",
      "name": "Respond 200",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 2,
      "position": [80, 0]
    }
  ],
  "connections": {
    "Webhook /health (public)": { "main": [ [ { "node": "Code → JSON", "type": "main", "index": 0 } ] ] },
    "Code → JSON": { "main": [ [ { "node": "Respond 200", "type": "main", "index": 0 } ] ] }
  },
  "settings": { "executionOrder": "v1" },
  "staticData": {},
  "version": 2,
  "active": false
}`

export default function DashboardPage() {
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(false)
  const [showWorkflowGuide, setShowWorkflowGuide] = useState(false)
  const [showInfraGuide, setShowInfraGuide] = useState(false)
  const [showFinalGuide, setShowFinalGuide] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const r = await fetch("/api/n8n/status", { cache: "no-store" })
      const j = (await r.json()) as Status
      setStatus(j)
    } catch (e: any) {
      setStatus({ ok: false, error: e?.message ?? String(e) })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const ok = status?.ok
  const dot = ok ? "bg-green-500" : "bg-red-500"

  return (
    <main className="min-h-[80vh] bg-black text-zinc-100 p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Aspect Console</h1>

        <div className="rounded-2xl border border-green-800 bg-green-950/20 p-5 mb-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-green-300">🚀 Final Deployment (5 Steps)</h2>
            <button
              onClick={() => setShowFinalGuide(!showFinalGuide)}
              className="text-sm px-3 py-1.5 rounded-lg bg-green-800 hover:bg-green-700 text-white"
            >
              {showFinalGuide ? "Hide Checklist" : "Go Live"}
            </button>
          </div>

          {showFinalGuide && (
            <div className="mt-4 text-sm space-y-4">
              <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-4">
                <h3 className="font-medium mb-2 text-green-300">Step 1: DNS A Record</h3>
                <div className="bg-zinc-900 p-3 rounded font-mono text-xs space-y-1">
                  <div>
                    Host: <span className="text-green-400">flow</span>
                  </div>
                  <div>
                    Type: <span className="text-blue-400">A</span>
                  </div>
                  <div>
                    Value: <span className="text-yellow-400">&lt;YOUR_DROPLET_IP&gt;</span>
                  </div>
                  <div>
                    TTL: <span className="text-purple-400">300</span>
                  </div>
                </div>
                <p className="text-xs text-zinc-400 mt-2">
                  Verify: <code>dig +short flow.aspectmarketingsolutions.app</code>
                </p>
              </div>

              <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-4">
                <h3 className="font-medium mb-2 text-green-300">Step 2: Containers Up</h3>
                <div className="bg-zinc-900 p-3 rounded font-mono text-xs space-y-1">
                  <div>docker compose up -d</div>
                  <div>docker compose ps</div>
                  <div>sudo ufw allow 80,443/tcp</div>
                </div>
              </div>

              <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-4">
                <h3 className="font-medium mb-2 text-green-300">Step 3: Import Workflows</h3>
                <p className="text-zinc-300 mb-2">
                  Import both workflow JSONs above, map Postgres credentials, activate.
                </p>
              </div>

              <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-4">
                <h3 className="font-medium mb-2 text-green-300">Step 4: Vercel Environment</h3>
                <div className="bg-zinc-900 p-3 rounded font-mono text-xs space-y-1">
                  <div>N8N_BASE_URL=https://flow.aspectmarketingsolutions.app</div>
                  <div>N8N_WEBHOOK_PATH=/webhook/vo-app</div>
                  <div>N8N_WEBHOOK_SECRET=********</div>
                </div>
                <p className="text-xs text-zinc-400 mt-2">Then redeploy Vercel app.</p>
              </div>

              <div className="rounded-lg bg-green-950/40 border border-green-900 p-4">
                <h3 className="font-medium mb-2 text-green-300">Step 5: Smoke Tests</h3>
                <div className="space-y-2 text-xs font-mono">
                  <div className="text-green-300"># Health check:</div>
                  <div className="text-zinc-300">curl -s https://flow.aspectmarketingsolutions.app/health | jq .</div>
                  <div className="text-green-300"># App connectivity:</div>
                  <div className="text-zinc-300">
                    curl -s https://aspectmarketingsolutions.app/api/n8n/status | jq .
                  </div>
                  <div className="text-green-300"># Test webhook (use dashboard form below):</div>
                  <div className="text-zinc-300">Use the manual trigger form at the bottom to test workflows</div>
                </div>
              </div>

              <div className="rounded-lg bg-blue-950/40 border border-blue-900 p-3">
                <h3 className="font-medium text-blue-300 mb-2">🎯 Go-Live Touches</h3>
                <ul className="text-xs text-blue-200 space-y-1">
                  <li>• Switch Stripe to live keys + webhook</li>
                  <li>• Set up uptime monitoring for both health endpoints</li>
                  <li>• Rotate N8N_WEBHOOK_SECRET monthly</li>
                  <li>• Enable Postgres backups</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 mb-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Infrastructure Setup</h2>
            <button
              onClick={() => setShowInfraGuide(!showInfraGuide)}
              className="text-sm px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700"
            >
              {showInfraGuide ? "Hide Setup" : "Fix DNS/NXDOMAIN"}
            </button>
          </div>

          {showInfraGuide && (
            <div className="mt-4 text-sm space-y-4">
              <div className="rounded-lg bg-red-950/40 border border-red-900 p-4">
                <h3 className="font-medium text-red-300 mb-2">Issue: DNS_PROBE_FINISHED_NXDOMAIN</h3>
                <p className="text-red-200">
                  The domain <code>flow.aspectmarketingsolutions.app</code> is not resolving. Follow these steps to fix
                  the infrastructure:
                </p>
              </div>

              <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-4">
                <h3 className="font-medium mb-2">1. Add DNS A Record:</h3>
                <div className="space-y-2 text-zinc-300">
                  <p>In your domain DNS settings (registrar or Cloudflare):</p>
                  <div className="bg-zinc-900 p-3 rounded font-mono text-xs">
                    <div>
                      Type: <span className="text-blue-400">A</span>
                    </div>
                    <div>
                      Name/Host: <span className="text-green-400">flow</span>
                    </div>
                    <div>
                      Value: <span className="text-yellow-400">&lt;YOUR_DROPLET_PUBLIC_IP&gt;</span>
                    </div>
                    <div>
                      TTL: <span className="text-purple-400">300</span>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-400">
                    Verify with: <code>dig +short flow.aspectmarketingsolutions.app</code>
                  </p>
                </div>
              </div>

              <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-4">
                <h3 className="font-medium mb-2">2. Docker Compose Setup:</h3>
                <p className="text-zinc-300 mb-3">
                  Create <code>docker-compose.yml</code>:
                </p>
                <textarea
                  readOnly
                  className="w-full h-48 text-xs bg-zinc-900 border border-zinc-700 rounded p-2 font-mono"
                  value={`version: "3.9"
services:
  n8n:
    image: n8nio/n8n:latest
    restart: unless-stopped
    environment:
      - GENERIC_TIMEZONE=America/Chicago
      - N8N_HOST=flow.aspectmarketingsolutions.app
      - N8N_PORT=5678
      - N8N_PROTOCOL=https
      - WEBHOOK_URL=https://flow.aspectmarketingsolutions.app
    volumes:
      - ./n8n_data:/home/node/.n8n
    networks: [web]

  caddy:
    image: caddy:latest
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
    networks: [web]

networks:
  web:
    driver: bridge`}
                />
              </div>

              <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-4">
                <h3 className="font-medium mb-2">3. Production Caddyfile (Basic Auth + Public Webhooks):</h3>
                <p className="text-zinc-300 mb-3">
                  Generate bcrypt hash first:{" "}
                  <code className="text-yellow-400">
                    docker run --rm caddy:latest caddy hash-password --plaintext 'YOUR_STRONG_PASSWORD'
                  </code>
                </p>
                <textarea
                  readOnly
                  className="w-full h-32 text-xs bg-zinc-900 border border-zinc-700 rounded p-2 font-mono"
                  value={`# /etc/caddy/Caddyfile
flow.aspectmarketingsolutions.app {
  encode zstd gzip

  # Public endpoints (no auth): webhooks + health
  @public path /webhook* /health*

  # Everything else (editor UI, /rest API, assets) requires Basic Auth
  @protected {
    not path /webhook* /health*
  }

  basicauth @protected {
    admin REPLACE_WITH_BCRYPT_HASH
  }

  reverse_proxy n8n:5678
}`}
                />
                <p className="text-xs text-zinc-400 mt-2">
                  Reload with: <code>docker compose restart caddy</code>
                </p>
              </div>

              <div className="rounded-lg bg-green-950/40 border border-green-900 p-3">
                <h3 className="font-medium mb-2 text-green-300">4. Verify Setup:</h3>
                <div className="space-y-2 text-xs font-mono">
                  <div className="text-green-300"># Test public health endpoint (no auth):</div>
                  <div className="text-zinc-300">curl -sS https://flow.aspectmarketingsolutions.app/health | jq .</div>
                  <div className="text-green-300"># Test protected editor (should prompt for auth):</div>
                  <div className="text-zinc-300">curl -I https://flow.aspectmarketingsolutions.app/</div>
                  <div className="text-green-300"># Test app connectivity:</div>
                  <div className="text-zinc-300">
                    curl -s https://aspectmarketingsolutions.app/api/n8n/status | jq .
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 mb-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">n8n Workflow Setup</h2>
            <button
              onClick={() => setShowWorkflowGuide(!showWorkflowGuide)}
              className="text-sm px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700"
            >
              {showWorkflowGuide ? "Hide Guide" : "Show Enhanced Workflow"}
            </button>
          </div>

          {showWorkflowGuide && (
            <div className="mt-4 text-sm space-y-4">
              <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-4">
                <h3 className="font-medium mb-2">1. Import Health Workflow (Public Endpoint):</h3>
                <p className="text-zinc-300 mb-3">
                  Import this first to create a public <code>/health</code> endpoint:
                </p>
                <textarea
                  readOnly
                  className="w-full h-32 text-xs bg-zinc-950 border border-zinc-700 rounded p-2 font-mono"
                  value={HEALTH_WORKFLOW_JSON}
                />
                <p className="text-xs text-zinc-400 mt-2">
                  After import: Activate workflow → Test:{" "}
                  <code>curl -sS https://flow.aspectmarketingsolutions.app/health | jq .</code>
                </p>
              </div>

              <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-4">
                <h3 className="font-medium mb-2">2. Import Main Workflow JSON:</h3>
                <p className="text-zinc-300 mb-3">
                  Go to <code className="text-blue-400">https://flow.aspectmarketingsolutions.app</code> → Workflows →
                  Import from file → paste JSON below → Import
                </p>
                <textarea
                  readOnly
                  className="w-full h-40 text-xs bg-zinc-950 border border-zinc-700 rounded p-2 font-mono"
                  value={WORKFLOW_JSON}
                />
              </div>

              <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-4">
                <h3 className="font-medium mb-2">3. Configure Credentials:</h3>
                <ol className="list-decimal list-inside space-y-1 text-zinc-300">
                  <li>Open each Postgres node: "PG: ensure table", "PG: ensure row", "PG: update credits"</li>
                  <li>Click Credentials → Select your Postgres credential (e.g., "VO Postgres")</li>
                  <li>Save each node</li>
                </ol>
              </div>

              <div className="rounded-lg bg-green-950/40 border border-green-900 p-4">
                <h3 className="font-medium mb-2 text-green-300">4. Test Commands:</h3>
                <div className="space-y-2 text-xs font-mono">
                  <div className="text-green-300"># Ping test:</div>
                  <div className="text-zinc-300 bg-zinc-900 p-2 rounded whitespace-pre-wrap">
                    {`curl -sS -X POST https://flow.aspectmarketingsolutions.app/webhook/vo-app \\
  -H "content-type: application/json" -H "x-vo-secret: $N8N_WEBHOOK_SECRET" \\
  -d '{"action":"status.ping"}' | jq .`}
                  </div>
                  <div className="text-green-300"># Add credits:</div>
                  <div className="text-zinc-300 bg-zinc-900 p-2 rounded whitespace-pre-wrap">
                    {`curl -sS -X POST https://flow.aspectmarketingsolutions.app/webhook/vo-app \\
  -H "content-type: application/json" -H "x-vo-secret: $N8N_WEBHOOK_SECRET" \\
  -d '{"action":"credits.add","email":"test@example.com","amount":25}' | jq .`}
                  </div>
                  <div className="text-green-300"># Use credits:</div>
                  <div className="text-zinc-300 bg-zinc-900 p-2 rounded whitespace-pre-wrap">
                    {`curl -sS -X POST https://flow.aspectmarketingsolutions.app/webhook/vo-app \\
  -H "content-type: application/json" -H "x-vo-secret: $N8N_WEBHOOK_SECRET" \\
  -d '{"action":"credits.use","email":"test@example.com","amount":3}' | jq .`}
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-blue-950/40 border border-blue-900 p-3">
                <p className="text-blue-300 text-xs">
                  <strong>Actions Available:</strong> status.ping, relevance.ask.app, relevance.ask.direct, credits.use,
                  credits.add
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`inline-block h-3 w-3 rounded-full ${dot}`} />
              <h2 className="text-lg font-medium">n8n Connectivity</h2>
            </div>
            <button
              onClick={load}
              className="text-sm px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700"
              disabled={loading}
            >
              {loading ? "Checking…" : "Retry"}
            </button>
          </div>

          <div className="mt-4 text-sm space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-zinc-400">Target:</span>
              <code className="text-zinc-300">{status?.target ?? "—"}</code>
            </div>

            {ok ? (
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-zinc-950 p-3 text-xs text-zinc-300">
                {JSON.stringify(status?.n8n, null, 2)}
              </pre>
            ) : (
              <div className="mt-2 rounded-lg bg-red-950/40 border border-red-900 p-3 text-red-300">
                {status?.error ?? "Unknown error"}
              </div>
            )}
          </div>

          <div className="mt-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                const form = e.currentTarget as HTMLFormElement & {
                  action: { value: string }
                  json: { value: string }
                }
                try {
                  const payload = form.json.value ? JSON.parse(form.json.value) : {}
                  const res = await fetch("/api/n8n/trigger", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ action: form.action.value, ...payload }),
                  })
                  const out = await res.json()
                  alert(res.ok ? "Triggered OK" : `Error: ${out.error}`)
                } catch (err: any) {
                  alert(`Invalid JSON or request failed: ${err?.message ?? err}`)
                }
              }}
              className="space-y-3"
            >
              <div className="flex gap-2">
                <input
                  name="action"
                  placeholder='action (e.g., "status.ping")'
                  className="flex-1 rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm"
                  defaultValue="status.ping"
                />
                <button type="submit" className="rounded-lg bg-white/10 hover:bg-white/20 px-4 text-sm">
                  Trigger
                </button>
              </div>
              <textarea
                name="json"
                placeholder='Optional JSON payload (e.g., {"from":"dashboard"})'
                className="w-full h-28 rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm"
                defaultValue='{"from":"dashboard"}'
              />
            </form>
          </div>
        </div>
      </div>
    </main>
  )
}
