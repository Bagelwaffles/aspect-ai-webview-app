"use client"

import { useEffect, useMemo, useState } from "react"
import { activitySinceMarker, advanceActivityFreshness, type OwnerActivityItem, type OwnerActivityModel } from "@/lib/operations/owner-activity"
import styles from "./owner-activity.module.css"

const MARKER_KEY = "ams:owner-activity:last-seen:v1"
const needsReview = (item: OwnerActivityItem) => item.approval.status !== "NONE" || item.status === "AWAITING_OWNER"
const GROUPS = [
  ["active", "What is happening now", (item: OwnerActivityItem) => !needsReview(item) && item.kind === "specialist" && item.status === "IN_PROGRESS"],
  ["approval", "What needs owner review", needsReview],
  ["finished", "What finished", (item: OwnerActivityItem) => !needsReview(item) && item.kind === "specialist" && ["COMPLETED", "NO_CHANGE"].includes(item.status)],
  ["blocked", "What is blocked or failed", (item: OwnerActivityItem) => !needsReview(item) && ["BLOCKED", "FAILED"].includes(item.status)],
  ["uncertain", "What is uncertain or stale", (item: OwnerActivityItem) => !needsReview(item) && ["UNAVAILABLE", "STALE", "APPROVAL_UNKNOWN"].includes(item.status)],
] as const
function Time({ value }: { value: string | null }) {
  return value ? <time dateTime={value}>{value.replace("T", " ").replace("Z", " UTC")}</time> : <>Unknown</>
}
function Badge({ value }: { value: string }) { return <span className={styles.badge} data-state={value}>{value.replaceAll("_", " ")}</span> }
function ActivityCard({ item }: { item: OwnerActivityItem }) {
  const request = item.approval.request
  return <article className={styles.card}>
    <header><h5>{item.title}</h5><Badge value={item.status} /></header>
    <p>{item.summary}</p>
    <p><strong>Next checkpoint:</strong> {item.nextCheckpoint}</p>
    <p><strong>Blocker:</strong> {item.blocker}</p>
    <dl className={styles.facts}>
      <dt>Source / actor</dt><dd>{item.source} / {item.actor}</dd>
      <dt>Reported task or signal</dt><dd>{item.reportedStatus}</dd>
      <dt>Started</dt><dd><Time value={item.startedAt} /></dd>
      <dt>Source last update</dt><dd><Time value={item.observedAt} /></dd>
      <dt>Received by AMS</dt><dd><Time value={item.receivedAt} /></dd>
      <dt>Completed at source</dt><dd><Time value={item.completedAt} /></dd>
      <dt>Tool outcome</dt><dd>{item.toolStatus.replaceAll("_", " ")}</dd>
      <dt>Owner action required</dt><dd>{item.ownerActionRequired === null ? "Unknown" : item.ownerActionRequired ? "Reported yes; review scope below" : "None reported"}</dd>
      <dt>Host approval status</dt><dd><Badge value={item.approval.status} /> {item.approval.reason}</dd>
      <dt>Deployment status</dt><dd>{item.deploymentStatus}. Not inferred from task completion.</dd>
      <dt>Release status</dt><dd>{item.releaseStatus}. No release authority is established here.</dd>
    </dl>
    {request ? <section className={styles.permission} aria-label={`Permission scope for ${item.title}`}>
      <h6>Exact reported permission request</h6>
      <dl className={styles.facts}>
        <dt>Requested action</dt><dd>{request.requestedAction}</dd>
        <dt>Capability / app or tool</dt><dd>{request.capability} / {request.tool}</dd>
        <dt>Target environment / site</dt><dd>{request.targetEnvironment} · {request.site ? <a href={request.site} target="_blank" rel="noopener noreferrer">Reported site, not an approval action</a> : "Site not reported"}</dd>
        <dt>Reason</dt><dd>{request.reason}</dd>
        <dt>Risk / impact</dt><dd>{request.riskImpact}</dd>
        <dt>Data exposure</dt><dd>{request.dataExposure}</dd>
        <dt>Duration / persistence</dt><dd>{request.duration} · {request.permissionType === "one_time" ? "One-time permission" : "Recurring permission requested; do not broaden access"}</dd>
        <dt>Requested at</dt><dd><Time value={request.requestedAt} /></dd>
        <dt>Imported outcome claim</dt><dd>{request.reportedOutcome}. This is not host confirmation.</dd>
        <dt>Host observation</dt><dd><Time value={item.approval.observedAt} /></dd>
      </dl>
      <p>Approve or deny only through the original host request after checking its current status and exact scope. No verified host action link is available here. This dashboard cannot grant approval, resend the request, or execute it.</p>
    </section> : null}
    <details>
      <summary>Result, evidence and recovery</summary>
      <dl className={styles.facts}>
        <dt>Last successful step</dt><dd>{item.lastSuccessfulStep}</dd>
        <dt>Result</dt><dd>{item.result}</dd>
        <dt>What changed</dt><dd>{item.changeSummary}</dd>
        <dt>Recovery path</dt><dd>{item.recovery}</dd>
        <dt>Evidence review</dt><dd>{item.verification}</dd>
      </dl>
      {item.evidence.length ? <ul>{item.evidence.map(evidence => <li key={evidence.url}><a href={evidence.url} target="_blank" rel="noopener noreferrer">{evidence.label}</a> · {evidence.provenance}</li>)}</ul> : <p>No usable completion evidence supplied.</p>}
    </details>
  </article>
}

export default function OwnerActivityCenter({ model }: { model: OwnerActivityModel }) {
  const [now, setNow] = useState(() => Date.parse(model.checkedAt))
  const [group, setGroup] = useState("all")
  const [marker, setMarker] = useState<string | null>(null)
  const [markerMessage, setMarkerMessage] = useState("No prior local read marker loaded.")
  const [showAllEvents, setShowAllEvents] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<string[]>([])
  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const timer = setInterval(tick, 30_000)
    try { const saved = localStorage.getItem(MARKER_KEY); setMarker(saved); setMarkerMessage(saved ? "Using this browser's local read marker." : "No prior local read marker.") } catch { setMarkerMessage("Local read marker unavailable; event history still works.") }
    return () => clearInterval(timer)
  }, [])
  const view = useMemo(() => advanceActivityFreshness(model, new Date(now)), [model, now])
  const newEvents = activitySinceMarker(view.events, marker, new Date(now))
  function markSeen() {
    try { localStorage.setItem(MARKER_KEY, model.checkedAt); setMarker(model.checkedAt); setMarkerMessage("Current feed marked as read in this browser only. Reports and approvals were not changed.") }
    catch { setMarkerMessage("Could not save the local read marker. Reports and approvals were not changed.") }
  }
  return <section className={styles.center} aria-labelledby="owner-activity-heading">
    <header>
      <h3 id="owner-activity-heading">Owner Activity &amp; Approval Center</h3>
      <p>Read-only, retained evidence. This is not a complete live task list. Specialist activity is manually relayed; automatic delivery and host-approval reconciliation are not connected.</p>
      <p>Last source read: <Time value={model.checkedAt} />. Report source: {model.sources.reports}; monitor snapshot: {model.sources.monitors}; events: {model.sources.monitorEvents}; findings: {model.sources.maintenance}.</p>
      <p>Missing data is not an empty queue. A completed report, ready Preview, approval click, and Production release are different facts.</p>
    </header>
    <div className={styles.controls}>
      <label htmlFor="owner-activity-filter">Show activity group</label>
      <select id="owner-activity-filter" value={group} onChange={event => setGroup(event.target.value)}>
        <option value="all">All groups</option>
        {GROUPS.map(([key, title]) => <option key={key} value={key}>{title}</option>)}
      </select>
    </div>
    {GROUPS.filter(([key]) => group === "all" || group === key).map(([key, title, predicate]) => {
      const rows = view.current.filter(predicate)
      const expanded = expandedGroups.includes(key)
      return <section key={key} aria-labelledby={`activity-group-${key}`}>
        <h4 id={`activity-group-${key}`}>{title} ({rows.length})</h4>
        {rows.length ? <div className={styles.grid}>{rows.slice(0, expanded ? rows.length : 20).map(item => <ActivityCard key={item.id} item={item} />)}</div> : <p>No matching item in this retained view. Source availability is shown above; external work or requests may still exist.</p>}
        {rows.length > 20 ? <button type="button" aria-expanded={expanded} onClick={() => setExpandedGroups(value => expanded ? value.filter(entry => entry !== key) : [...value, key])}>{expanded ? `Show latest 20: ${title}` : `Show all ${rows.length} retained items: ${title}`}</button> : null}
      </section>
    })}
    <section aria-labelledby="activity-timeline-heading">
      <h4 id="activity-timeline-heading">What changed since I last looked</h4>
      <p>{newEvents} retained report or source events after the local read marker. Report receipt time is used for new imports; monitor events use their original source time. Late-discovered older monitor events may not count as new. New receipt does not make old evidence fresh.</p>
      <div className={styles.controls}><button type="button" onClick={markSeen}>Mark current feed as read</button><span role="status" aria-live="polite">{markerMessage}</span></div>
      <p>Chronological source history, newest first. Repeated identical updates are collapsed. At most 250 retained events are shown; this is not a complete audit log.</p>
      {view.events.length ? <ol className={styles.timeline}>{view.events.slice(0, showAllEvents ? 250 : 30).map(event => <li key={event.id}>
        <strong>{event.title}</strong> <Badge value={event.status} />
        <p>{event.changeSummary} · {event.source} · {event.actor}</p>
        <p>Source <Time value={event.observedAt} /> · Received <Time value={event.receivedAt} /> · Reported {event.reportedStatus}</p>
      </li>)}</ol> : <p>No retained activity events are available. This does not prove no work occurred.</p>}
      {view.events.length > 30 ? <button type="button" aria-expanded={showAllEvents} onClick={() => setShowAllEvents(value => !value)}>{showAllEvents ? "Show latest 30 events" : "Show retained events"}</button> : null}
    </section>
  </section>
}
