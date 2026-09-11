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

function cleanAndLimit(value: string, maxLength: number): string {
  return clean(value).slice(0, maxLength).trim()
}

export function buildLeadMagnetContentBrief(input: LeadMagnetWorkflowInput): ContentAgentBrief {
  const typeLabel = TYPE_LABELS[input.type]
  const problem = cleanAndLimit(input.problem, 120)
  const outcome = cleanAndLimit(input.desiredOutcome, 120)
  const offer = clean(input.offer ?? "")

  const goal = [
    `Create a finished reader-facing ${typeLabel}, not an outline or description of one.`,
    `Solve: ${problem}.`,
    `Desired outcome: ${outcome}.`,
    "Make the body usable on its own with concrete steps, prompts, checkboxes or sections appropriate to the format. Avoid unsupported claims or guarantees.",
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
