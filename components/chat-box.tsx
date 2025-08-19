"use client"

import type React from "react"

import { useEffect, useRef, useState } from "react"
import SubscribeButton from "./subscribe-button"

type Msg = { role: "user" | "assistant" | "error" | "system"; text: string; t: number }
type Assistant = { id: string; label: string }

const DEFAULT_ASSISTANTS: Assistant[] = [
  { id: "AspectBot", label: "AspectBot" },
  { id: "Aspect AGI Commander", label: "Aspect AGI Commander" },
  { id: "TeeAndTrauma_AgentAccess", label: "TeeAndTrauma Agent" },
]

function extractReply(data: any): string {
  const d = data?.data ?? data
  const candidates = [d?.reply, d?.message, d?.text, d?.output, d?.result, d?.choices?.[0]?.message?.content].filter(
    Boolean,
  )
  if (candidates.length) return String(candidates[0])
  try {
    return "```json\n" + JSON.stringify(d ?? data, null, 2) + "\n```"
  } catch {
    return String(d ?? data ?? "")
  }
}

async function billingStatus(email: string) {
  const r = await fetch(`/api/billing/status?email=${encodeURIComponent(email)}`, { cache: "no-store" })
  return (await r.json()) as { ok: boolean; subscribed?: boolean; error?: string }
}

async function consumeCredit(email: string) {
  const r = await fetch("/api/credits/use", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, amount: 1, meta: { source: "chat" } }),
  })
  return (await r.json()) as { ok: boolean; remaining?: number; error?: string }
}

export default function ChatBox({
  assistants = DEFAULT_ASSISTANTS,
  defaultAssistantId,
  requireSubscription = true,
  className = "",
}: {
  assistants?: Assistant[]
  defaultAssistantId?: string
  requireSubscription?: boolean
  className?: string
}) {
  const [assistantId, setAssistantId] = useState(
    defaultAssistantId ||
      (typeof window !== "undefined" && localStorage.getItem("ams.assistantId")) ||
      assistants[0]?.id,
  )
  const [email, setEmail] = useState<string>(
    () => (typeof window !== "undefined" && (localStorage.getItem("ams.email") || "")) || "",
  )
  const [subscribed, setSubscribed] = useState<boolean | null>(null)
  const [useCredits, setUseCredits] = useState(true)

  const [messages, setMessages] = useState<Msg[]>([
    { role: "system", text: "You're connected to Aspect Chat. Ask anything.", t: Date.now() },
  ])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (assistantId) localStorage.setItem("ams.assistantId", assistantId)
  }, [assistantId])
  useEffect(() => {
    if (email) localStorage.setItem("ams.email", email)
  }, [email])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, loading])

  useEffect(() => {
    ;(async () => {
      if (!requireSubscription) return
      if (!email) {
        setSubscribed(false)
        return
      }
      try {
        const j = await billingStatus(email)
        setSubscribed(!!(j.ok && j.subscribed))
      } catch {
        setSubscribed(false)
      }
    })()
  }, [email, requireSubscription])

  async function send() {
    const text = input.trim()
    if (!text || loading) return

    if (requireSubscription) {
      if (!email) {
        alert("Enter your email to verify subscription.")
        return
      }
      if (subscribed === false) {
        alert("Subscription required.")
        return
      }
    }

    if (useCredits) {
      const r = await consumeCredit(email)
      if (!r.ok) {
        alert(r.error || "Unable to use credit")
        return
      }
    }

    setInput("")
    setMessages((m) => [...m, { role: "user", text, t: Date.now() }])
    setLoading(true)
    try {
      const meta =
        typeof window !== "undefined"
          ? { source: "chat-ui", path: window.location.pathname, email }
          : { source: "chat-ui", email }
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assistantId, message: text, metadata: meta }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json?.error || res.statusText)
      const reply = extractReply(json)
      setMessages((m) => [...m, { role: "assistant", text: reply, t: Date.now() }])
    } catch (e: any) {
      setMessages((m) => [...m, { role: "error", text: e?.message || "Request failed", t: Date.now() }])
    } finally {
      setLoading(false)
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  const locked = requireSubscription && (subscribed === false || !email)

  return (
    <div
      className={["w-full rounded-2xl border border-zinc-800 bg-zinc-900/90 backdrop-blur p-4", className].join(" ")}
    >
      {/* Header */}
      <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${locked ? "bg-red-500" : "bg-emerald-500"} shadow-[0_0_12px_rgba(16,185,129,0.7)]`}
          />
          <h2 className="text-sm font-semibold text-zinc-100">Aspect Chat</h2>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="rounded-lg bg-black/40 text-xs text-zinc-200 border border-zinc-800 px-2 py-1"
          />
          <select
            value={assistantId}
            onChange={(e) => setAssistantId(e.target.value)}
            className="rounded-lg bg-black/40 text-xs text-zinc-200 border border-zinc-800 px-2 py-1"
            aria-label="Select assistant"
          >
            {assistants.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          {requireSubscription && !subscribed ? (
            <SubscribeButton label="Subscribe" customer_email={email} className="text-xs py-1" />
          ) : null}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="relative max-h-[50vh] min-h-[30vh] overflow-y-auto rounded-xl bg-black/30 border border-zinc-800 p-3 space-y-2"
      >
        {messages.map((m, i) => (
          <div key={m.t + ":" + i} className={["flex", m.role === "user" ? "justify-end" : "justify-start"].join(" ")}>
            <div
              className={[
                "max-w-[85%] whitespace-pre-wrap text-sm rounded-xl px-3 py-2",
                m.role === "user" && "bg-white/10 text-zinc-100 border border-white/10",
                m.role === "assistant" && "bg-zinc-950 text-zinc-200 border border-zinc-800",
                m.role === "system" && "bg-indigo-950/40 text-indigo-200 border border-indigo-900/40",
                m.role === "error" && "bg-red-950/40 text-red-200 border border-red-900/50",
              ].join(" ")}
            >
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-xl px-3 py-2 bg-zinc-950 text-zinc-400 border border-zinc-800 text-sm">typing…</div>
          </div>
        )}

        {locked && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center text-sm text-zinc-300">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
              {email ? "Subscription required to chat." : "Enter your email to check subscription."}
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="mt-3 flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder={locked ? "Locked — subscribe to chat" : "Type your message… (Shift+Enter = newline)"}
          disabled={locked}
          className="flex-1 h-24 resize-none rounded-xl bg-black/40 border border-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-700 disabled:opacity-50"
        />
        <div className="flex flex-col gap-2 items-stretch">
          {requireSubscription && (
            <label className="text-[11px] text-zinc-400 flex items-center gap-2">
              <input type="checkbox" checked={useCredits} onChange={(e) => setUseCredits(e.target.checked)} />
              Use 1 credit on send
            </label>
          )}
          <button
            onClick={send}
            disabled={loading || !input.trim() || locked}
            className="h-10 shrink-0 rounded-xl px-4 text-sm font-medium text-white bg-white/10 hover:bg-white/20 disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">
        Enter to send • Shift+Enter for newline • Assistant: {assistantId}
      </p>
    </div>
  )
}
