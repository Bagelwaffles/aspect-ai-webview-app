"use client"

import { useEffect, useState, type FormEvent } from "react"

import type { AciVerifiedKnowledge } from "@/lib/server/aci-knowledge-store"

type Props = {
  repoSha: string
  agentSlug: "content-agent"
  agentVersion: "content-v1"
  runtimeEnabled: boolean
  researchFindings: Array<{ id: string; summary: string; sourceObservedAt: string }>
}

type SourceForm = {
  url: string
  title: string
  publisher: string
}

const emptySource: SourceForm = { url: "", title: "", publisher: "" }

async function readJson(response: Response): Promise<Record<string, unknown>> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error("ACI_KNOWLEDGE_INVALID_RESPONSE")
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("ACI_KNOWLEDGE_INVALID_RESPONSE")
  }
  const value = body as Record<string, unknown>
  if (!response.ok || value.ok !== true) {
    throw new Error(typeof value.code === "string" ? value.code : "ACI_KNOWLEDGE_REQUEST_FAILED")
  }
  return value
}

export default function AciKnowledgeReviewClient({
  repoSha,
  agentSlug,
  agentVersion,
  runtimeEnabled,
  researchFindings,
}: Props) {
  const [fact, setFact] = useState(
    "Agent trace grading uses structured scores or labels to assess end-to-end decisions, tool calls, and policy adherence; repeated evaluations can reveal regressions and guide improvements.",
  )
  const [researchFindingId, setResearchFindingId] = useState(researchFindings[0]?.id ?? "")
  const [sources, setSources] = useState<[SourceForm, SourceForm]>([
    {
      url: "https://developers.openai.com/api/docs/guides/trace-grading",
      title: "Trace grading",
      publisher: "OpenAI",
    },
    {
      url: "https://docs.langchain.com/langsmith/evaluation-types",
      title: "Evaluation types",
      publisher: "LangChain",
    },
  ])
  const [reviewed, setReviewed] = useState(false)
  const [independent, setIndependent] = useState(false)
  const [publicOnly, setPublicOnly] = useState(false)
  const [noSensitiveData, setNoSensitiveData] = useState(false)
  const [factOnly, setFactOnly] = useState(false)
  const [facts, setFacts] = useState<AciVerifiedKnowledge[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [revokeReason, setRevokeReason] = useState("")

  async function loadFacts() {
    setLoading(true)
    setError(null)
    try {
      const query = new URLSearchParams({ agentSlug, agentVersion, limit: "50" })
      const response = await fetch("/api/internal/aci/knowledge?" + query.toString(), {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      })
      const data = await readJson(response)
      if (!Array.isArray(data.facts)) throw new Error("ACI_KNOWLEDGE_RESPONSE_INVALID")
      setFacts(data.facts as AciVerifiedKnowledge[])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ACI_KNOWLEDGE_READ_FAILED")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadFacts()
    // The agent namespace is fixed by the Preview dashboard deployment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentSlug, agentVersion, repoSha])

  function updateSource(index: 0 | 1, key: keyof SourceForm, value: string) {
    setSources((previous) => previous.map((source, i) =>
      i === index ? { ...source, [key]: value } : source,
    ) as [SourceForm, SourceForm])
  }

  const attestationsComplete = reviewed && independent && publicOnly && noSensitiveData && factOnly
  const sourcesComplete = sources.every((source) =>
    source.url.trim().startsWith("https://") &&
    source.title.trim().length >= 4 &&
    source.publisher.trim().length >= 2,
  )

  async function promoteFact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || !repoSha || !researchFindingId || !attestationsComplete || !sourcesComplete || fact.trim().length < 24) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch("/api/internal/aci/knowledge", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "promote_verified_fact",
          agentSlug,
          agentVersion,
          reviewedAgainstRepoSha: repoSha,
          researchFindingId,
          fact: fact.trim(),
          sources: sources.map((source) => ({
            ...source,
            reviewedAt: new Date().toISOString(),
          })),
          attestations: {
            sourceContentReviewed: reviewed,
            sourcesIndependent: independent,
            publicOnly,
            noCustomerDataOrSecrets: noSensitiveData,
            factOnlyNoInstructions: factOnly,
          },
        }),
      })
      const data = await readJson(response)
      setNotice(data.new === false ? "This exact fact was already stored; no duplicate was created." : "Owner-attested fact stored in the existing Preview Redis namespace.")
      setFact("")
      setSources([{ ...emptySource }, { ...emptySource }])
      setReviewed(false)
      setIndependent(false)
      setPublicOnly(false)
      setNoSensitiveData(false)
      setFactOnly(false)
      await loadFacts()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ACI_KNOWLEDGE_PROMOTION_FAILED")
    } finally {
      setSaving(false)
    }
  }

  async function revokeFact(id: string) {
    if (saving || revokeReason.trim().length < 12) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch("/api/internal/aci/knowledge", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "revoke_verified_fact",
          id,
          agentSlug,
          agentVersion,
          reason: revokeReason.trim(),
        }),
      })
      await readJson(response)
      setNotice("Fact revoked. It remains in the audit record and is no longer returned to the agent.")
      setRevokeReason("")
      await loadFacts()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ACI_KNOWLEDGE_REVOCATION_FAILED")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-sky-500/40 bg-sky-500/5 p-5" aria-labelledby="aci-knowledge-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-sky-700">Owner-reviewed · Preview only</p>
          <h2 id="aci-knowledge-title" className="text-xl font-semibold">Persistent agent knowledge</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Promote a public factual statement only after personally reviewing two independent sources.
            The record is immutable, version-scoped, expires, and can be revoked.
          </p>
        </div>
        <span className="rounded-md border px-2 py-1 text-xs font-semibold">{agentSlug} · {agentVersion}</span>
      </div>

      <div className="rounded-lg border bg-background/70 p-3 text-sm">
        <p className="font-medium">Runtime status: {runtimeEnabled ? "Enabled on this Preview" : "OFF"}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Memory retrieval is disabled by default. No Production runtime consumes these facts.
          A fact is owner-attested, not machine-authenticated; its sources remain visible for review.
        </p>
        <p className="mt-2 break-all font-mono text-xs text-muted-foreground">Reviewed against commit: {repoSha || "unavailable"}</p>
      </div>

      <form onSubmit={promoteFact} className="space-y-3 rounded-lg border bg-background/70 p-4">
        <h3 className="font-semibold">Review and promote one factual statement</h3>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Verified ACI research finding</span>
          <select value={researchFindingId} onChange={(event) => setResearchFindingId(event.target.value)} required className="w-full rounded-md border bg-background p-2">
            <option value="">Select a checks-passed research finding</option>
            {researchFindings.map((finding) => (
              <option key={finding.id} value={finding.id}>{finding.summary} · {finding.id.slice(0, 10)}</option>
            ))}
          </select>
          {researchFindings.length === 0 ? (
            <span className="text-xs text-muted-foreground">No recent checks-passed ACI research findings are available. Record and verify a research finding first.</span>
          ) : null}
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Factual statement</span>
          <textarea
            value={fact}
            onChange={(event) => setFact(event.target.value)}
            minLength={24}
            maxLength={500}
            rows={3}
            required
            className="w-full rounded-md border bg-background p-2"
            placeholder="Write one concise, public, declarative fact. Do not enter instructions or customer information."
          />
          <span className="text-xs text-muted-foreground">{fact.length}/500 characters</span>
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          {sources.map((source, index) => (
            <fieldset key={index} className="space-y-2 rounded-md border p-3">
              <legend className="px-1 text-sm font-medium">Independent source {index + 1}</legend>
              <label className="block space-y-1 text-xs">
                <span>HTTPS source URL</span>
                <input value={source.url} onChange={(event) => updateSource(index as 0 | 1, "url", event.target.value)} required type="url" className="w-full rounded-md border bg-background p-2" placeholder="https://..." />
              </label>
              <label className="block space-y-1 text-xs">
                <span>Page title</span>
                <input value={source.title} onChange={(event) => updateSource(index as 0 | 1, "title", event.target.value)} required maxLength={200} className="w-full rounded-md border bg-background p-2" />
              </label>
              <label className="block space-y-1 text-xs">
                <span>Publisher</span>
                <input value={source.publisher} onChange={(event) => updateSource(index as 0 | 1, "publisher", event.target.value)} required maxLength={120} className="w-full rounded-md border bg-background p-2" />
              </label>
            </fieldset>
          ))}
        </div>

        <div className="space-y-2 rounded-md border p-3 text-sm">
          <p className="font-medium">Owner attestations — all required</p>
          <label className="flex items-start gap-2"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} className="mt-1"/> I opened and reviewed both source pages; they support this exact factual statement.</label>
          <label className="flex items-start gap-2"><input type="checkbox" checked={independent} onChange={(event) => setIndependent(event.target.checked)} className="mt-1"/> The sources are independent publishers, not duplicates or syndicated copies.</label>
          <label className="flex items-start gap-2"><input type="checkbox" checked={publicOnly} onChange={(event) => setPublicOnly(event.target.checked)} className="mt-1"/> The fact and sources are public information.</label>
          <label className="flex items-start gap-2"><input type="checkbox" checked={noSensitiveData} onChange={(event) => setNoSensitiveData(event.target.checked)} className="mt-1"/> No customer data, personal information, credentials, or secrets are included.</label>
          <label className="flex items-start gap-2"><input type="checkbox" checked={factOnly} onChange={(event) => setFactOnly(event.target.checked)} className="mt-1"/> This is a factual statement, not an instruction, policy override, or tool permission.</label>
        </div>

        <button type="submit" disabled={saving || !repoSha || !researchFindingId || !attestationsComplete || !sourcesComplete || fact.trim().length < 24} className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
          {saving ? "Saving owner-reviewed fact…" : "Promote owner-reviewed fact"}
        </button>
      </form>

      {error ? <p role="alert" className="rounded-md border border-red-500/40 p-3 text-sm">{error}</p> : null}
      {notice ? <p role="status" className="rounded-md border border-green-600/40 p-3 text-sm">{notice}</p> : null}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">Stored knowledge</h3>
          <button type="button" onClick={() => void loadFacts()} disabled={loading || saving} className="rounded-md border px-3 py-1 text-xs disabled:opacity-50">Refresh</button>
        </div>
        {loading ? <p className="text-sm text-muted-foreground">Loading owner-reviewed facts…</p> : facts.length === 0 ? (
          <p className="rounded-md border p-3 text-sm text-muted-foreground">No active owner-reviewed facts for this agent version.</p>
        ) : facts.map((item) => (
          <article key={item.id} className="space-y-2 rounded-md border bg-background/70 p-3">
            <div className="flex flex-wrap justify-between gap-2">
              <p className="font-medium">{item.fact}</p>
              <span className="text-xs font-semibold">{item.status}</span>
            </div>
            <p className="text-xs text-muted-foreground">Owner-reviewed {item.verification.reviewedAt} · Expires {item.expiresAt}</p>
            <ul className="list-disc space-y-1 pl-5 text-xs">
              {item.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer" className="underline">{source.publisher}: {source.title}</a></li>)}
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{item.id}</span>
              {item.status === "active" ? (
                <button type="button" onClick={() => void revokeFact(item.id)} disabled={saving || revokeReason.trim().length < 12} className="rounded-md border px-2 py-1 text-xs disabled:opacity-50">Revoke</button>
              ) : null}
            </div>
          </article>
        ))}
        <label className="block space-y-1 text-xs">
          <span>Reason for revoking a selected active fact (minimum 12 characters)</span>
          <input value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} maxLength={300} className="w-full rounded-md border bg-background p-2" />
        </label>
      </div>
    </section>
  )
}
