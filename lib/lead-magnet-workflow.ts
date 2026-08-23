export type LeadMagnetType = "checklist" | "quick-guide" | "worksheet" | "planner" | "email-course"
export type LeadMagnetTone = "professional" | "friendly" | "confident" | "educational" | "conversational"

export type LeadMagnetWorkflowInput = {
  businessName: string
  audience: string
  type: LeadMagnetType
  problem: string
  desiredOutcome: string
  tone: LeadMagnetTone
  offer?: string
}

export type ContentAgentBrief = {
  businessName: string
  audience: string
  goal: string
  channel: "blog"
  tone: LeadMagnetTone
  offer?: string
}

const TYPE_LABELS: Record<LeadMagnetType, string> = {
  checklist: "practical checklist",
  "quick-guide": "quick-start guide",
  worksheet: "hands-on worksheet",
  planner: "simple action planner",
  "email-course": "short email-course style guide",
}

function clean(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

export function buildLeadMagnetContentBrief(input: LeadMagnetWorkflowInput): ContentAgentBrief {
  const typeLabel = TYPE_LABELS[input.type]
  const problem = clean(input.problem)
  const outcome = clean(input.desiredOutcome)
  const offer = clean(input.offer ?? "")

  const goal = [
    `Create a complete ${typeLabel} that helps the audience solve this problem: ${problem}.`,
    `The desired outcome is: ${outcome}.`,
    "Make it useful on its own, organized into clear sections or steps, and avoid unsupported claims or guarantees.",
  ].join(" ")

  return {
    businessName: clean(input.businessName),
    audience: clean(input.audience),
    goal,
    channel: "blog",
    tone: input.tone,
    ...(offer ? { offer } : {}),
  }
}
