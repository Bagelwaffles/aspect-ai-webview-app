"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { SPECIALISTS, parseReport, parseStoredReport, reportContentKey, type SpecialistId } from "@/lib/operations/reporting"
import { reportingFailureMessage } from "@/lib/operations/reporting-feedback"
import styles from "./operations-reporting.module.css"

export default function OperationsReportingClient({ repoSha }: { repoSha: string }) {
  const router = useRouter()
  const [specialistId, setSpecialistId] = useState<SpecialistId>("engineering")
  const [text, setText] = useState("")
  const [attested, setAttested] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const inFlight = useRef(false)

  async function submit() {
    if (inFlight.current || !attested) return
    const binding = { specialistId, sourceSystemId: `owner-reviewed-specialist:${specialistId}` }
    let report: unknown
    try { report = JSON.parse(text) } catch { setMessage("Invalid JSON. Nothing sent."); return }
    const parsed = parseReport(report, binding)
    if (!parsed.ok) { setMessage(`${parsed.error}. Nothing sent.`); return }
    inFlight.current = true
    setBusy(true)
    setMessage("Saving this report once, then reading it back…")
    try {
      const response = await fetch("/api/internal/operations/reports", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specialistId, reviewedAgainstRepoSha: repoSha, attestations: { publicOnly: true, noSensitiveData: true, sourceReviewed: true }, report }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(typeof result.code === "string" ? result.code : "REPORTING_REQUEST_FAILED")
      const saved = parseStoredReport(result.report, binding)
      if (!saved.ok) throw new Error("REPORTING_RECEIPT_INVALID")
      const readback = await fetch("/api/internal/operations/reports", { cache: "no-store", credentials: "same-origin" })
      const history = await readback.json()
      if (!readback.ok || history.state !== "available" || !Array.isArray(history.data)) throw new Error("REPORTING_READBACK_UNAVAILABLE")
      const matches = history.data.filter((value: unknown) => {
        const entry = parseStoredReport(value, binding)
        return entry.ok && entry.report.reportId === saved.report.reportId && entry.report.receivedAt === saved.report.receivedAt && reportContentKey(entry.report) === reportContentKey(saved.report)
      })
      if (matches.length !== 1) throw new Error("REPORTING_READBACK_MISMATCH")
      setMessage(`${result.created ? "Report saved" : "Duplicate suppressed"}; one matching immutable report read back. Observation time unchanged. No action or approval executed.`)
      router.refresh()
    } catch (error) {
      setMessage(reportingFailureMessage(error))
    } finally { inFlight.current = false; setBusy(false) }
  }
  return (
    <details className={styles.importer}>
      <summary>Import one owner-reviewed specialist report</summary>
      <p>Manual Preview bridge. This does not contact specialists, refresh their evidence, run tools, notify anyone, or grant approval.</p>
      <label>Existing specialist lane
        <select value={specialistId} disabled={busy} onChange={event => { setSpecialistId(event.target.value as SpecialistId); setAttested(false) }}>
          {SPECIALISTS.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}
        </select>
      </label>
      <label>Minimized report JSON
        <textarea rows={10} maxLength={16000} value={text} disabled={busy} onChange={event => { setText(event.target.value); setAttested(false) }} placeholder="Paste a version 1 report or version 2 activity update. Preserve actual source times. Do not include receivedAt or host confirmation." />
      </label>
      <p>Source identity must be owner-reviewed-specialist:{specialistId}. Evidence URLs must be public HTTPS with no query (only recognized GitHub evidence anchors are accepted). No prompts, private outputs, task IDs, customer details, financial identifiers or credentials.</p>
      <label className={styles.attestation}><input type="checkbox" checked={attested} disabled={busy} onChange={event => setAttested(event.target.checked)} />I reviewed this source. The minimized report and links are public-only and contain no sensitive or customer data. This is a report, not authorization.</label>
      <button type="button" onClick={submit} disabled={busy || !attested || !text.trim() || !/^[a-f0-9]{40}$/.test(repoSha)}>{busy ? "Saving and reading back…" : "Save reviewed Preview report"}</button>
      <p role="status" aria-live="polite">{message}</p>
    </details>
  )
}
