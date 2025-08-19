"use client"

import type React from "react"

import { useState } from "react"

export default function LeadCapture({ className = "" }: { className?: string }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    useCase: "",
    budget: "",
    message: "",
  })
  const [status, setStatus] = useState<null | { ok: boolean; msg: string }>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setStatus(null)
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j?.error || res.statusText)
      // Save email for Chat gating
      if (typeof window !== "undefined") localStorage.setItem("ams.email", form.email)
      setStatus({ ok: true, msg: "Thanks! We'll reach out shortly." })
    } catch (e: any) {
      setStatus({ ok: false, msg: e?.message || "Failed to submit" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={["rounded-2xl border border-zinc-800 bg-zinc-900 p-4", className].join(" ")}>
      <h2 className="text-base font-semibold text-zinc-100 mb-3">Get in touch</h2>
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <input
          className="input"
          placeholder="Name*"
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          className="input"
          placeholder="Email*"
          type="email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <input
          className="input sm:col-span-2"
          placeholder="Company"
          value={form.company}
          onChange={(e) => setForm({ ...form, company: e.target.value })}
        />
        <input
          className="input sm:col-span-2"
          placeholder="Use case (what do you need?)"
          value={form.useCase}
          onChange={(e) => setForm({ ...form, useCase: e.target.value })}
        />
        <input
          className="input"
          placeholder="Budget (optional)"
          value={form.budget}
          onChange={(e) => setForm({ ...form, budget: e.target.value })}
        />
        <textarea
          className="input sm:col-span-2 h-24"
          placeholder="Message"
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
        />
        <div className="sm:col-span-2 flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-white/10 hover:bg-white/20 px-4 py-2 text-white"
          >
            {loading ? "Submitting…" : "Send"}
          </button>
          {status && (
            <span className={status.ok ? "text-emerald-400 text-xs" : "text-red-400 text-xs"}>{status.msg}</span>
          )}
        </div>
      </form>

      {/* tiny css helpers */}
      <style jsx>{`
        .input {
          background: rgba(0,0,0,0.4);
          border: 1px solid rgb(39,39,42);
          border-radius: 0.75rem;
          padding: 0.5rem 0.75rem;
          color: #e4e4e7;
          width: 100%;
          outline: none;
        }
        .input:focus { border-color: rgb(82,82,91); }
      `}</style>
    </div>
  )
}
