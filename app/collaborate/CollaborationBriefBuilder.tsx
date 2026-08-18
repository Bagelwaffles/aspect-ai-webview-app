"use client"

import { FormEvent, useMemo, useState } from "react"
import styles from "./collaborate.module.css"

type BriefFields = {
  name: string
  role: string
  company: string
  website: string
  audience: string
  strengths: string
  currentOffer: string
  assets: string
  collaborationIdea: string
  contribution: string
  needFromAms: string
  desiredOutcome: string
  pilot: string
  timeline: string
  revenueModel: string
  dataNeeds: string
  risks: string
  successMetrics: string
  notes: string
}

const emptyBrief: BriefFields = {
  name: "",
  role: "",
  company: "",
  website: "",
  audience: "",
  strengths: "",
  currentOffer: "",
  assets: "",
  collaborationIdea: "",
  contribution: "",
  needFromAms: "",
  desiredOutcome: "",
  pilot: "",
  timeline: "",
  revenueModel: "",
  dataNeeds: "",
  risks: "",
  successMetrics: "",
  notes: "",
}

const labels: Record<keyof BriefFields, string> = {
  name: "Your name",
  role: "Role / specialty",
  company: "Company / brand",
  website: "Website or profile",
  audience: "Who you serve",
  strengths: "Your strongest capabilities",
  currentOffer: "What you currently sell or provide",
  assets: "Assets you can contribute",
  collaborationIdea: "Collaboration idea",
  contribution: "What you would own",
  needFromAms: "What you need from AMS",
  desiredOutcome: "Desired outcome",
  pilot: "Smallest useful pilot",
  timeline: "Preferred timeline",
  revenueModel: "Possible commercial / revenue model",
  dataNeeds: "Systems, data, or account access that may be needed",
  risks: "Risks, constraints, or concerns",
  successMetrics: "How we would measure success",
  notes: "Anything else we should know",
}

export default function CollaborationBriefBuilder({ aiContext }: { aiContext: string }) {
  const [brief, setBrief] = useState<BriefFields>(emptyBrief)
  const [copied, setCopied] = useState<"brief" | "prompt" | null>(null)

  const completedBrief = useMemo(() => {
    const lines = (Object.keys(brief) as (keyof BriefFields)[]).map((key) => {
      const value = brief[key].trim() || "Not provided yet"
      return `## ${labels[key]}\n${value}`
    })

    return [
      "# AMS COLLABORATION BRIEF",
      "",
      "This document is an exploratory collaboration brief. It is not a contract, partnership agreement, revenue-share agreement, or authorization to access accounts or customer data.",
      "",
      ...lines,
      "",
      "## Recommended next step",
      "Review this brief together, select one reversible pilot, define owners and success criteria, then document any commercial terms separately before client-facing work begins.",
    ].join("\n")
  }, [brief])

  const aiInterviewPrompt = useMemo(
    () => `You are helping me prepare a potential collaboration with Aspect Marketing Solutions (AMS).\n\nFIRST, read the verified public AMS context below. Do not upgrade planned capabilities into live capabilities and do not invent facts that are not provided.\n\n--- AMS CONTEXT ---\n${aiContext}\n--- END AMS CONTEXT ---\n\nInterview me one question at a time so we can determine whether a collaboration makes business sense. Ask about:\n1. my name, role, company and public profile;\n2. the audience I serve;\n3. my strongest skills and existing offer;\n4. assets, distribution, technology, workflows or expertise I can contribute;\n5. the business problem I think AMS and I could solve together;\n6. what I would own and what I would need AMS to own;\n7. the smallest safe pilot we can run before serving shared clients;\n8. timeline and capacity;\n9. possible commercial models without assuming a revenue split;\n10. data, integrations or account access that may be needed;\n11. risks, conflicts, compliance concerns or dependencies;\n12. measurable success criteria.\n\nAfter the interview, produce:\n- a one-paragraph collaboration thesis;\n- a structured collaboration brief;\n- a proposed 7-14 day pilot;\n- responsibilities for each side;\n- assumptions that still need verification;\n- risks and guardrails;\n- recommended commercial options, clearly marked as proposals only;\n- a go / revise / no-go recommendation with reasons;\n- the five questions that should be answered before any agreement is signed.\n\nNever request passwords, API keys, private keys, payment-card data, or secret tokens. Recommend owner-authorized integrations and least-privilege access instead.`,
    [aiContext],
  )

  async function copyText(kind: "brief" | "prompt", value: string) {
    await navigator.clipboard.writeText(value)
    setCopied(kind)
    window.setTimeout(() => setCopied(null), 1800)
  }

  function downloadBrief(event: FormEvent) {
    event.preventDefault()
    const blob = new Blob([completedBrief], { type: "text/markdown;charset=utf-8" })
    const href = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = href
    link.download = "AMS-Collaboration-Brief.md"
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(href)
  }

  return (
    <div className={styles.briefBuilder}>
      <div className={styles.aiAssistCard}>
        <div>
          <span className={styles.microLabel}>AI-assisted option</span>
          <h3>Don&apos;t want to fill this out manually?</h3>
          <p>
            Give the prompt to ChatGPT, Claude, Gemini, or another AI assistant. It will interview
            you one question at a time and return a structured collaboration proposal using AMS&apos;s
            verified public context.
          </p>
        </div>
        <button className={styles.secondaryButton} type="button" onClick={() => copyText("prompt", aiInterviewPrompt)}>
          {copied === "prompt" ? "Prompt copied" : "Copy AI interview prompt"}
        </button>
      </div>

      <form className={styles.briefForm} onSubmit={downloadBrief}>
        {(Object.keys(brief) as (keyof BriefFields)[]).map((key) => {
          const compact = ["name", "role", "company", "website", "timeline"].includes(key)
          return (
            <label className={compact ? styles.fieldCompact : styles.field} key={key}>
              <span>{labels[key]}</span>
              {compact ? (
                <input
                  value={brief[key]}
                  onChange={(event) => setBrief((current) => ({ ...current, [key]: event.target.value }))}
                  placeholder="Type here"
                />
              ) : (
                <textarea
                  value={brief[key]}
                  onChange={(event) => setBrief((current) => ({ ...current, [key]: event.target.value }))}
                  placeholder="A few clear sentences are enough."
                  rows={4}
                />
              )}
            </label>
          )
        })}

        <div className={styles.formActions}>
          <button className={styles.primaryButton} type="button" onClick={() => copyText("brief", completedBrief)}>
            {copied === "brief" ? "Brief copied" : "Copy completed brief"}
          </button>
          <button className={styles.secondaryButton} type="submit">
            Download brief
          </button>
        </div>
      </form>
    </div>
  )
}
