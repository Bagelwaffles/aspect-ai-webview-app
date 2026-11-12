"use client"
import { useEffect, useState } from "react"
import styles from "./operations-reporting.module.css"

/** Display-only clock: no polling, producer execution or external schedule. */
export default function ReportingStatus({ value, expiresAt, checkedAt }: { value: string; expiresAt?: string | null; checkedAt?: string }) {
  const [now, setNow] = useState(() => checkedAt ? Date.parse(checkedAt) : 0)
  useEffect(() => {
    if (!expiresAt) return
    const tick = () => setNow(Date.now())
    tick()
    const timer = setInterval(tick, 30_000)
    return () => clearInterval(timer)
  }, [expiresAt])
  const displayed = expiresAt && now >= Date.parse(expiresAt) ? "stale" : value
  return <span className={styles.status} data-status={displayed}>{displayed.replaceAll("_", " ")}</span>
}
