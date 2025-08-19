"use client"

import { useEffect, useState } from "react"

type Status = { ok: boolean; n8n?: any; error?: string; target?: string }

export default function DashboardPage() {
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(false)

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
                  className="flex-1 rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm"
                  defaultValue="status.ping"
                />
                <button type="submit" className="rounded-lg bg-white/10 hover:bg-white/20 px-4 text-sm">
                  Trigger
                </button>
              </div>
              <textarea
                name="json"
                placeholder='Optional JSON payload (e.g., {"from":"dashboard"})'
                className="w-full h-28 rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm"
                defaultValue='{"from":"dashboard"}'
              />
            </form>
          </div>
        </div>
      </div>
    </main>
  )
}
