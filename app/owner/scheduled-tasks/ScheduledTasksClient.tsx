"use client"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import type { TaskDefinition, TaskState } from "@/lib/server/scheduled-task-engine"
type Row = { definition: TaskDefinition; state: TaskState }
const timestamp = (value: string | null) => value ? new Date(value).toLocaleString("en-US", { timeZone: "America/Chicago" }) : "Not recorded"
export default function ScheduledTasksClient() {
  const [tasks, setTasks] = useState<Row[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [configured, setConfigured] = useState(false)
  const [failuresOnly, setFailuresOnly] = useState(false)
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/internal/scheduled-tasks", { cache: "no-store" })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.code || "Task status unavailable")
      setTasks(data.tasks); setConfigured(data.schedulerConfigured); setError(null)
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Task status unavailable") }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  async function action(id: string, operation: "pause" | "resume" | "run" | "retry") {
    setBusy(id); setError(null)
    try {
      const response = await fetch("/api/internal/scheduled-tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: operation, ...(operation === "run" ? { requestId: crypto.randomUUID() } : {}) }) })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.code || data.state?.error || data.outcome || "Task action failed")
      await refresh()
    } catch (failure) { await refresh(); setError(failure instanceof Error ? failure.message : "Task action failed") }
    finally { setBusy(null) }
  }
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center gap-4 text-sm"><Link href="/dashboard" className="underline">Owner console</Link><button onClick={() => void refresh()} className="rounded border px-3 py-2">Refresh</button><label><input type="checkbox" checked={failuresOnly} onChange={event => setFailuresOnly(event.target.checked)} /> Show failures only</label></div>
    <p className="rounded border p-3 text-sm">Scheduler configuration: {configured ? "enabled; independent trigger proof must be checked below" : "disabled"}. A manual run does not prove scheduled operation.</p>
    {error && <p role="alert" className="rounded border border-red-500 p-3 text-red-600">{error}</p>}
    {tasks.map(({ definition, state }) => <article key={definition.id} className="space-y-3 rounded-xl border p-4">
      <div><h2 className="text-lg font-semibold">{definition.name}</h2><p className="text-sm">{definition.category} · {state.enabled ? "Enabled" : "Paused"} · {definition.schedule.frequency} · {definition.schedule.timezone}</p></div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt>Last successful execution</dt><dd>{timestamp(state.lastSuccess)}</dd></div><div><dt>Next scheduled execution</dt><dd>{state.enabled ? timestamp(state.retryAt ?? state.nextExecution) : "Paused"}</dd></div><div><dt>Last independent scheduled success</dt><dd>{timestamp(state.lastScheduledSuccess)}</dd></div><div><dt>Last scheduled trigger</dt><dd>{timestamp(state.lastScheduledTrigger)}</dd></div><div><dt>Latest result</dt><dd>{state.history[0]?.result?.summary ?? "No completed result"}</dd></div><div><dt>Error condition</dt><dd>{state.error ?? "No recorded error"}{state.missedRun && " · Missed schedule detected; coalesced recovery"}</dd></div><div><dt>Notification</dt><dd>{state.history[0]?.notification ?? "No notification"} · Receipt: {state.history[0]?.deliveryReceipt ?? "Not verified"}</dd></div></dl>
      <div className="flex flex-wrap gap-2">{([state.enabled ? "pause" : "resume", "run", "retry"] as const).map(operation => <button key={operation} disabled={busy !== null || (operation === "run" && !state.enabled)} onClick={() => void action(definition.id, operation)} className="rounded border px-3 py-2 text-sm capitalize disabled:opacity-40">{busy === definition.id ? "Working…" : operation === "run" ? "Run now" : operation === "retry" ? "Retry failed execution / delivery" : operation}</button>)}</div>
      <details><summary className="cursor-pointer text-sm">Execution history and results</summary><div className="mt-3 space-y-3">{state.history.filter(run => !failuresOnly || run.status === "failed" || run.status === "interrupted" || run.notification === "exhausted").map(run => <section key={run.id} className="rounded border p-3 text-sm"><p>{timestamp(run.startedAt)} · {run.trigger} · {run.status} · attempt {run.attempt}</p><p>{run.error ?? run.result?.summary}</p><p>Notification: {run.notification} · attempts: {run.deliveryAttempts} · receipt: {run.deliveryReceipt ?? "Not verified"}</p><pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(run.result?.details ?? {}, null, 2)}</pre></section>)}</div></details>
    </article>)}
  </section>
}
