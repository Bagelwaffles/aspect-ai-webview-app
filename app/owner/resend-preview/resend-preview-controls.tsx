"use client"

import { useState } from "react"

type ConfigReport = {
  ok?: boolean
  status?: string
  code?: string
  checks?: Record<string, boolean>
  remainingEvidence?: string[]
  sendsEnabled?: boolean
}

type ProbeReport = {
  ok?: boolean
  code?: string
  providerVerified?: boolean
  sendEnabled?: boolean
  paymentTestPerformed?: boolean
}

async function readSafeJson(response: Response): Promise<Record<string, unknown>> {
  const raw: unknown = await response.json().catch(() => null)
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  return raw as Record<string, unknown>
}

function humanize(value: string): string {
  return value.replace(/([a-z])([A-Z])/gu, "$1 $2").replace(/_/gu, " ")
}

export function ResendPreviewControls() {
  const [loading, setLoading] = useState<"config" | "probe" | null>(null)
  const [configuration, setConfiguration] = useState<ConfigReport | null>(null)
  const [probe, setProbe] = useState<ProbeReport | null>(null)
  const [httpCode, setHttpCode] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function execute(action: "config" | "probe") {
    if (loading) return
    setLoading(action)
    setError(null)
    setHttpCode(null)
    if (action === "config") setConfiguration(null)
    else setProbe(null)
    try {
      const res = await fetch(
        action === "config"
          ? "/api/internal/quick-audit-resend-preflight"
          : "/api/internal/quick-audit-resend-proof-probe",
        {
          method: action === "config" ? "GET" : "POST",
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
        },
      )
      setHttpCode(res.status)
      const body = await readSafeJson(res)
      if (action === "config") {
        const checks =
          body.checks && typeof body.checks === "object" && !Array.isArray(body.checks)
            ? Object.fromEntries(
                Object.entries(body.checks).filter(
                  ([, value]) => typeof value === "boolean",
                ),
              ) as Record<string, boolean>
            : undefined
        setConfiguration({
          ok: body.ok === true,
          status: typeof body.status === "string" ? body.status : undefined,
          code: typeof body.code === "string" ? body.code : undefined,
          sendsEnabled: body.sendsEnabled === true,
          checks,
          remainingEvidence: Array.isArray(body.remainingEvidence)
            ? body.remainingEvidence.filter((x): x is string => typeof x === "string")
            : undefined,
        })
      } else {
        setProbe({
          ok: res.ok && body.ok === true,
          code: typeof body.code === "string" ? body.code : "NO_CONFIRMED_RESULT",
          providerVerified: body.providerVerified === true,
          sendEnabled: body.sendEnabled === true,
          paymentTestPerformed: body.paymentTestPerformed === true,
        })
      }
    } catch {
      setError("Request unavailable. No successful verification can be claimed.")
    } finally {
      setLoading(null)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/75 p-6 shadow-lg">
      <h2 className="text-lg font-semibold">Owner acceptance gates</h2>
      <p className="mt-2 text-sm text-slate-300">
        The configuration check only reads safe boolean flags. The manual
        probe writes one random key with a 45-second expiry, verifies it, and
        deletes it. It cannot verify a Resend domain or send an email.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" disabled={loading !== null}
          onClick={() => void execute("config")}
          className="rounded-lg border border-cyan-500/60 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-900/40 disabled:opacity-50">
          {loading === "config" ? "Checking..." : "Check configuration"}
        </button>
        <button type="button" disabled={loading !== null}
          onClick={() => void execute("probe")}
          className="rounded-lg border border-slate-500 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800 disabled:opacity-50">
          {loading === "probe" ? "Testing..." : "Run non-payment storage probe"}
        </button>
      </div>
      {httpCode !== null && <p className="mt-4 text-xs text-slate-400">HTTP response: {httpCode}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-amber-300">{error}</p>}
      {configuration && (
        <div className="mt-5 space-y-3" aria-live="polite">
          <h3 className="font-semibold">
            Configuration: {configuration.ok ? "Ready for further verification" : "Blocked"}
          </h3>
          {configuration.code && <p className="text-sm text-amber-300">{configuration.code}</p>}
          {configuration.checks && (
            <ul className="space-y-1 text-sm">
              {Object.entries(configuration.checks).map(([name, passed]) => (
                <li key={name} className={passed ? "text-emerald-300" : "text-amber-300"}>
                  {passed ? "PASS" : "BLOCKED"} — {humanize(name)}
                </li>
              ))}
            </ul>
          )}
          {configuration.remainingEvidence?.length ? (
            <p className="text-xs text-slate-400">
              Still requires independent evidence: {configuration.remainingEvidence.map(humanize).join(", ")}
            </p>
          ) : null}
          <p className="text-xs text-slate-400">
            The preflight is configuration-only. Automatic delivery is not authorized.
          </p>
        </div>
      )}
      {probe && (
        <div className="mt-5" aria-live="polite">
          <h3 className={probe.ok ? "font-semibold text-emerald-300" : "font-semibold text-amber-300"}>
            Storage probe: {probe.ok ? "Passed" : "Blocked or failed"}
          </h3>
          <p className="mt-1 text-sm text-slate-300">{probe.code}</p>
          <p className="mt-2 text-xs text-slate-400">
            Provider verified: no. Sending enabled: no. Payment test performed: no.
            Even a pass confirms only this temporary Preview key.
          </p>
        </div>
      )}
    </section>
  )
}
