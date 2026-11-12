import Link from "next/link"
import { SPECIALISTS, projectHistory } from "@/lib/operations/reporting"
import { MONITOR_DEFINITIONS, type getOperationsTelemetry } from "@/lib/server/operations-telemetry"
import OperationsReportingClient from "./OperationsReportingClient"
import styles from "./operations-reporting.module.css"
import Status from "./ReportingStatus"
import OwnerActivityCenter from "./OwnerActivityCenter"
import { projectOwnerActivity } from "@/lib/operations/owner-activity"

type Operations = Awaited<ReturnType<typeof getOperationsTelemetry>>
function time(value: string | null) { return value ? `${value.replace("T", " ").replace(".000Z", " UTC")}` : "Unknown" }
export default function OperationsReporting({ data, repoSha }: { data: Operations; repoSha: string }) {
  const { snapshot, events } = data.monitoring
  const monitorRows = snapshot.data?.rows ?? MONITOR_DEFINITIONS.map(([key, name]) => ({ key, name, status: snapshot.state, observedAt: null, reportedStatus: null }))
  return (
    <section className={styles.root} aria-labelledby="operations-heading">
      <header><p>PREVIEW · OWNER ONLY</p><h2 id="operations-heading">Operations reporting</h2>
        <p>Partially connected. Saved monitor evidence and owner-reviewed reports only. Automatic specialist transport and repair execution are not verified.</p>
        <p>Read attempted {time(data.checkedAt)} · No monitor run or outbound alert is triggered by this page.</p>
      </header>
      <OwnerActivityCenter model={projectOwnerActivity(data)} />
      <section aria-labelledby="specialists-heading"><h3 id="specialists-heading">Eight specialist reporting lanes</h3>
        <p>Report store: <Status value={data.reports.state} /> · Last read {time(data.reports.checkedAt)}. Receiving an old report never makes its evidence fresh. Costs are unknown unless separately measured; no zero-cost claim is inferred.</p>
        <div className={styles.grid}>{data.specialists.map(lane => {
          const source = SPECIALISTS.find(item => item.id === lane.specialistId)!
          const report = lane.report
          return <article id={`lane-${source.id}`} className={styles.card} key={source.id}>
            <h4>{source.name}</h4><Status value={data.reports.state === "available" ? lane.status : data.reports.state} expiresAt={data.reports.state === "available" ? lane.expiresAt : null} checkedAt={data.checkedAt} /><p>{source.responsibility}</p>
            {report ? <>
              <p>{report.summary}</p><dl><dt>Observed</dt><dd>{time(report.observedAt)}</dd><dt>Source last run</dt><dd>{time(report.sourceLastRunAt)}</dd><dt>Received</dt><dd>{time(report.receivedAt)}</dd><dt>Fresh until</dt><dd>{time(lane.expiresAt)}</dd><dt>Verification</dt><dd>{report.verification.replaceAll("_", " ")} · {report.confidence} confidence. Source authenticity not machine-verified.</dd><dt>Current work</dt><dd>{report.currentWork || "Not reported"}</dd><dt>Blocker</dt><dd>{report.blocker || "None reported; not independently verified"}</dd><dt>Next action</dt><dd>{report.nextAction || "Not reported"}</dd></dl>
              <ul>{report.evidence.map(evidence => <li key={evidence.url}><a href={evidence.url} target="_blank" rel="noopener noreferrer">{evidence.label}</a><small>{evidence.provenance}</small></li>)}</ul>
              <small>Source: {report.sourceSystem.id} / {report.sourceSystem.version}. Report: {report.reportId}.</small>
              <details><summary>Retained history</summary><ul>{projectHistory((data.reports.data ?? []).filter(entry => entry.specialistId === source.id), new Date(data.checkedAt), 10).map(entry => <li key={entry.report!.reportId}>{time(entry.report!.observedAt)} · historical <Status value={entry.status} expiresAt={entry.expiresAt} checkedAt={data.checkedAt} /> · {entry.report!.verification.replaceAll("_", " ")} · {entry.report!.reportId}</li>)}</ul></details>
            </> : <p>No usable imported report. The existing specialist may have newer work outside AMS; this lane makes no claim about it.</p>}
          </article>
        })}</div>
      </section>
      <section aria-labelledby="monitor-heading"><h3 id="monitor-heading">Existing backend monitors</h3>
        <p>Snapshot: <Status value={snapshot.state} /> · Source observed {time(snapshot.data?.observedAt ?? null)}. Configured cadence: daily 13:17 UTC; successful scheduling is not proven here. Freshness limit: 48 hours.</p>
        <p>Legacy OK/info signals remain neutral because configuration and bounded database reads do not prove end-to-end health. Targets can differ from the Preview datastore, including existing public website checks.</p>
        <div className={styles.grid}>{monitorRows.map(row => <article className={styles.card} key={row.key}><h4>{row.name}</h4><Status value={row.status} expiresAt={row.observedAt ? new Date(Date.parse(row.observedAt) + 48 * 60 * 60 * 1000).toISOString() : null} checkedAt={data.checkedAt} /><p>Reported signal: {row.reportedStatus ?? "unknown"}</p><p>Observed {time(row.observedAt)}</p><Link href="/api/internal/monitoring">Owner-only saved evidence</Link></article>)}</div>
        <details><summary>Recent stored change events ({events.state})</summary>{events.data?.length ? <ul>{events.data.map(event => <li key={event.id}>{time(event.createdAt)} · {event.monitorKey} · {event.toStatus} {event.recovery ? "· recorded recovery" : ""}</li>)}</ul> : <p>{events.state === "available" ? "Event query succeeded with no retained rows. This does not establish no incidents or successful scheduling." : "Event data unavailable. No empty or healthy conclusion."}</p>}</details>
      </section>
      <section aria-labelledby="maintenance-heading"><h3 id="maintenance-heading">Existing finding and Draft PR evidence</h3><p>Source: existing maintenance store · {data.maintenance.state}. CI evidence is recorded evidence, not a fresh GitHub query.</p>
        {data.maintenance.data?.length ? <ul>{data.maintenance.data.map(finding => <li key={finding.id}><Link href="/dashboard/maintenance">Finding {finding.id.slice(0, 10)}</Link> · {finding.state.replaceAll("_", " ")} · observed {time(finding.sourceObservedAt)} · {Date.parse(data.checkedAt) - Date.parse(finding.sourceObservedAt) >= 48 * 60 * 60 * 1000 ? "stale source evidence" : "recent source evidence"}{finding.pr ? <> · <a href={finding.pr.url} target="_blank" rel="noopener noreferrer">Draft PR</a> at {finding.pr.headSha.slice(0, 12)} · checks recorded {time(finding.pr.ciVerifiedAt)} ({!finding.pr.ciVerifiedAt ? "unknown" : Date.parse(data.checkedAt) - Date.parse(finding.pr.ciVerifiedAt) >= 48 * 60 * 60 * 1000 ? "stale" : "recent recorded evidence"})</> : null}. Release approval not established.</li>)}</ul> : <p>{data.maintenance.state === "available" ? "Query succeeded; no indexed findings returned." : "Finding availability unknown; not a clean bill of health."}</p>}
      </section>
      <OperationsReportingClient repoSha={repoSha} />
    </section>
  )
}
