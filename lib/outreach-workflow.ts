export type OutreachStage = "first-contact" | "follow-up" | "objection-response"
export type OutreachChannel = "email" | "linkedin" | "social-dm"
export type OutreachRelationship = "cold-relevant" | "warm-intro" | "existing-conversation"
export type OutreachObjective = "quick-audit" | "intro-call" | "send-details" | "continue-conversation"
export type OutreachTone = "professional" | "friendly" | "confident" | "educational" | "conversational"

export type OutreachWorkflowInput = {
  businessName: string
  prospectDescription: string
  stage: OutreachStage
  channel: OutreachChannel
  relationship: OutreachRelationship
  objective: OutreachObjective
  knownContext?: string
  objection?: string
  tone: OutreachTone
  offer?: string
}

export type ContentAgentBrief = {
  businessName: string
  audience: string
  goal: string
  channel: "email" | "social"
  tone: OutreachTone
  offer?: string
}

const STAGE_LABELS: Record<OutreachStage, string> = {
  "first-contact": "first-contact message",
  "follow-up": "follow-up message",
  "objection-response": "reply to a stated objection",
}

const RELATIONSHIP_LABELS: Record<OutreachRelationship, string> = {
  "cold-relevant": "no prior relationship is claimed",
  "warm-intro": "a warm introduction exists only if the supplied context says so",
  "existing-conversation": "an existing conversation exists only as described in supplied context",
}

const OBJECTIVE_LABELS: Record<OutreachObjective, string> = {
  "quick-audit": "invite interest in the $49 Quick Marketing Audit",
  "intro-call": "ask whether a short introductory conversation would be useful",
  "send-details": "ask permission to send more details",
  "continue-conversation": "continue the existing conversation without pressure",
}

function clean(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

function clipped(value: string, max: number): string {
  return clean(value).slice(0, max)
}

export function buildOutreachContentBrief(input: OutreachWorkflowInput): ContentAgentBrief {
  const context = clipped(input.knownContext ?? "", 150)
  const objection = clipped(input.objection ?? "", 120)
  const offer = clean(input.offer ?? "")

  const goalParts = [
    "DRAFT ONLY. Do not send, automate, scrape, or claim consent.",
    "Never invent personalization, prior contact, a warm intro, urgency, results, or facts.",
    `Write one ${STAGE_LABELS[input.stage]}; ${RELATIONSHIP_LABELS[input.relationship]}.`,
    `Objective: ${OBJECTIVE_LABELS[input.objective]}.`,
    context ? `Known context: ${context}.` : "Use only the prospect description; do not fabricate context.",
    input.stage === "objection-response" && objection ? `Objection to address: ${objection}.` : "",
    "Keep it concise, respectful, specific, and easy to decline. Human review is required before any use.",
  ].filter(Boolean)

  return {
    businessName: clean(input.businessName),
    audience: clipped(input.prospectDescription, 500),
    goal: goalParts.join(" ").slice(0, 500),
    channel: input.channel === "email" ? "email" : "social",
    tone: input.tone,
    ...(offer ? { offer: clipped(offer, 500) } : {}),
  }
}
