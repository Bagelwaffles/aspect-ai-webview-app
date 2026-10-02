"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

type CloudStatus = {
  enabled: boolean
  configured: boolean
  paired: boolean
  daemon: boolean
  remoteLoginActive?: boolean
  profilePresent?: boolean
  profileRetentionDays?: number
}

export default function CloudBrowserLifecycleClient() {
  const [status, setStatus] = useState<CloudStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [loginUrl, setLoginUrl] = useState("")
  const [launchUrl, setLaunchUrl] = useState("")

  const refresh = useCallback(async () => {
    const response = await fetch("/api/internal/browser-control/cloud/status", { cache: "no-store" })
    if (!response.ok) {
      setStatus(null)
      setMessage(`Status check failed (${response.status})`)
      return
    }
    const body = await response.json()
    setStatus({
      enabled: Boolean(body.enabled),
      configured: Boolean(body.configured),
      paired: Boolean(body.paired),
      daemon: Boolean(body.daemon),
      remoteLoginActive: Boolean(body.remoteLoginActive),
      profilePresent: Boolean(body.profilePresent),
      profileRetentionDays: typeof body.profileRetentionDays === "number" ? body.profileRetentionDays : undefined,
    })
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function mutate(path: "stop" | "run") {
    setBusy(true)
    setMessage("")
    setLaunchUrl("")
    try {
      const response = await fetch(`/api/internal/browser-control/cloud/${path}`, { method: "POST" })
      const body = await response.json()
      if (!response.ok) {
        setMessage(body.code || `Cloud browser ${path} failed`)
        return
      }
      setMessage(path === "stop"
        ? "Cloud Sandbox stopped. Persistent filesystem snapshot requested."
        : "Cloud Sandbox resumed and daemon dispatched.")
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function startOwnerLogin() {
    setBusy(true)
    setMessage("")
    setLaunchUrl("")
    try {
      const response = await fetch("/api/internal/browser-control/cloud/login-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUrl: loginUrl.trim() }),
      })
      const body = await response.json()
      if (!response.ok || typeof body.launchUrl !== "string") {
        const code = typeof body.code === "string" ? body.code : ""
        if (code === "CLOUD_LOGIN_PROVIDER_UNSUPPORTED") {
          setMessage("Google, YouTube, and Google Play authentication are not supported in the Vercel login console. Use the official AMS OAuth/API connection or your normal phone browser instead.")
        } else if (code === "CLOUD_LOGIN_URL_REQUIRED") {
          setMessage("Enter a supported provider login URL first.")
        } else {
          setMessage(code || "Secure cloud login session failed")
        }
        return
      }
      setLaunchUrl(body.launchUrl)
      const minutes = Math.max(1, Math.ceil(Number(body.expiresInSeconds || 600) / 60))
      setMessage(`Secure owner login is ready for ${minutes} minutes. The Browser Control daemon is paused while the console owns the persistent Chromium profile and will restart automatically when the console closes or expires.`)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#050711] px-4 py-8 text-slate-100 md:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="rounded-3xl border border-cyan-400/20 bg-slate-950 p-6 md:p-8">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">AMS // Cloud Browser Lifecycle</p>
          <h1 className="mt-3 text-3xl font-black md:text-5xl">Persistent Vercel browser control.</h1>
          <p className="mt-4 text-sm leading-6 text-slate-400">
            Owner-only lifecycle controls for the named Sandbox, plus an ephemeral login console for provider sign-in and MFA without putting provider credentials into AMS chat, Redis, or Browser Control jobs.
          </p>
        </header>

        <section className="rounded-3xl border border-slate-800 bg-slate-950 p-6">
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div><span className="text-slate-500">Configured</span><p className="mt-1 font-bold">{status?.configured ? "Yes" : "No"}</p></div>
            <div><span className="text-slate-500">Paired</span><p className="mt-1 font-bold">{status?.paired ? "Yes" : "No"}</p></div>
            <div><span className="text-slate-500">Sandbox daemon</span><p className="mt-1 font-bold">{status?.daemon ? "Active" : "Idle"}</p></div>
            <div><span className="text-slate-500">Owner login console</span><p className="mt-1 font-bold">{status?.remoteLoginActive ? "Active" : "Closed"}</p></div>
            <div><span className="text-slate-500">Persistent profile</span><p className="mt-1 font-bold">{status?.profilePresent ? "Present" : "Not yet detected"}</p></div>
            <div><span className="text-slate-500">Profile snapshot retention</span><p className="mt-1 font-bold">{status?.profileRetentionDays ? `${status.profileRetentionDays} days, refreshed on use` : "Checking"}</p></div>
          </div>

          {message ? <p className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-sm text-cyan-100">{message}</p> : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={busy || Boolean(status?.remoteLoginActive) || !status?.configured || !status?.paired || !loginUrl.trim()}
              onClick={() => void mutate("stop")}
              className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-5 py-3 font-black text-amber-100 disabled:opacity-40"
            >
              Sleep Cloud Worker
            </button>
            <button
              type="button"
              disabled={busy || Boolean(status?.remoteLoginActive) || !status?.configured || !status?.paired}
              onClick={() => void mutate("run")}
              className="rounded-xl bg-cyan-300 px-5 py-3 font-black text-slate-950 disabled:opacity-40"
            >
              Wake Cloud Worker
            </button>
          </div>
        </section>

        <section className="rounded-3xl border border-violet-400/20 bg-violet-400/5 p-6">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-200">Secure owner login</p>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Start a ten-minute console only when a supported provider requires login, MFA, consent, CAPTCHA, or another human security check. The temporary access token stays in the launch URL fragment and is removed from the address bar as soon as the console opens.
          </p>
          <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/5 px-4 py-3 text-xs leading-5 text-amber-100">
            Google, YouTube, and Google Play block this automated Chromium environment. AMS uses official Google OAuth/API connections for supported workflows; Play Console-only owner steps must be completed in your normal browser.
          </p>
          <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-slate-400" htmlFor="cloud-login-url">Provider URL</label>
          <input
            id="cloud-login-url"
            type="url"
            value={loginUrl}
            onChange={(event) => setLoginUrl(event.target.value)}
            placeholder="https://www.linkedin.com/login"
            disabled={busy || Boolean(status?.remoteLoginActive)}
            className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 disabled:opacity-40"
          />
          <button
            type="button"
            disabled={busy || Boolean(status?.remoteLoginActive) || !status?.configured || !status?.paired}
            onClick={() => void startOwnerLogin()}
            className="mt-3 w-full rounded-xl border border-violet-300/30 bg-violet-300 px-5 py-3 font-black text-slate-950 disabled:opacity-40"
          >
            Start Secure Cloud Login
          </button>
          {launchUrl ? (
            <a
              href={launchUrl}
              target="_blank"
              rel="noreferrer"
              referrerPolicy="no-referrer"
              className="mt-3 block rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-5 py-3 text-center font-black text-emerald-100"
            >
              Open Secure Cloud Login Console
            </a>
          ) : null}
        </section>

        <section className="rounded-3xl border border-emerald-400/20 bg-emerald-400/5 p-5 text-sm leading-6 text-emerald-100">
          Provider passwords and MFA values are entered only inside the temporary Sandbox console. AMS does not store them. After the session closes, the same persistent Chromium profile returns to the cloud Browser Control daemon. Provider-controlled session expiration and future reauthentication still apply.
        </section>

        <Link href="/dashboard/browser-control" className="inline-block font-bold text-cyan-300 underline">
          Back to Browser Control
        </Link>
      </div>
    </main>
  )
}
