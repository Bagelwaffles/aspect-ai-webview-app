"use client"

import { useState } from "react"

const TEST_INPUT = {
  businessName: "Aspect Marketing Solutions",
  audience: "Small business owners who need practical help improving their marketing",
  goal: "Promote the AMS $49 Quick Marketing Audit",
  channel: "social",
  tone: "confident",
  offer: "Quick Marketing Audit — $49 one-time",
} as const

type ProofResult = {
  ok?: boolean
  code?: string
  error?: string
  run?: {
    id?: string
    status?: string
    creditState?: string
    output?: {
      headline?: string
      body?: string
      callToAction?: string
      safetyNotes?: string[]
    } | null
  }
}

function operationKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `owner-proof-${crypto.randomUUID()}`
  }
  return `owner-proof-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

export default function OwnerContentProofClient() {
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState("Ready to run one authenticated production proof.")
  const [result, setResult] = useState<ProofResult | null>(null)

  async function runProof() {
    if (running) return
    setRunning(true)
    setResult(null)

    try {
      setStatus("Granting one-time owner test access…")
      const grantResponse = await fetch("/api/internal/owner-test-entitlement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "GRANT_OWNER_CONTENT_TEST" }),
      })
      const grant = await grantResponse.json().catch(() => ({}))
      if (!grantResponse.ok) {
        throw new Error(`${grant.code ?? "GRANT_FAILED"}: ${grant.error ?? "Owner test access could not be granted"}`)
      }

      setStatus("Running Content Agent through the production AMS runtime…")
      const response = await fetch("/api/content-agent/runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": operationKey(),
        },
        body: JSON.stringify(TEST_INPUT),
      })
      const body = (await response.json().catch(() => ({}))) as ProofResult
      setResult(body)

      if (!response.ok || body.run?.status !== "succeeded" || !body.run.output) {
        throw new Error(`${body.code ?? "CONTENT_PROOF_FAILED"}: ${body.error ?? `Production proof failed (${response.status})`}`)
      }

      setStatus("PRODUCTION PROOF PASSED — the Content Agent generated, saved, and committed a protected run.")
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Production proof failed")
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="mt-8 space-y-5">
      <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
        <p className="font-medium text-white">Fixed production proof</p>
        <p className="mt-2">Business: Aspect Marketing Solutions</p>
        <p>Goal: Promote the $49 Quick Marketing Audit</p>
        <p>Action: Generate one social draft only. Nothing is posted or sent externally.</p>
      </div>

      <button
        type="button"
        onClick={runProof}
        disabled={running}
        className="rounded-lg bg-cyan-400 px-5 py-3 font-semibold text-black hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {running ? "Running production proof…" : "Run Content Agent production proof"}
      </button>

      <p className="rounded-lg border border-white/10 bg-black/30 p-4 text-sm text-zinc-200" role="status">
        {status}
      </p>

      {result?.run?.output ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-5 text-sm text-zinc-100">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">Saved production output</p>
          <h2 className="mt-3 text-lg font-semibold">{result.run.output.headline}</h2>
          <p className="mt-3 whitespace-pre-wrap leading-6">{result.run.output.body}</p>
          <p className="mt-3 font-medium">CTA: {result.run.output.callToAction}</p>
          <p className="mt-3 text-xs text-zinc-300">Run status: {result.run.status} · Credit: {result.run.creditState}</p>
        </div>
      ) : null}
    </div>
  )
}
