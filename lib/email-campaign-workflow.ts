export type EmailCampaignType = "promotion" | "launch" | "announcement" | "educational" | "event"
export type EmailCampaignLength = "3" | "5" | "7"
export type EmailCampaignTone = "professional" | "friendly" | "confident" | "educational" | "conversational"

export type EmailCampaignWorkflowInput = {
  businessName: string
  audience: string
  campaignType: EmailCampaignType
  sequenceLength: EmailCampaignLength
  objective: string
  keyMessage: string
  tone: EmailCampaignTone
  offer?: string
  constraints?: string
}

export type ContentAgentBrief = {
  businessName: string
  audience: string
  goal: string
  channel: "email"
  tone: EmailCampaignTone
  offer?: string
}

const TYPE_LABELS: Record<EmailCampaignType, string> = {
  promotion: "promotion",
  launch: "launch",
  announcement: "announcement",
  educational: "educational campaign",
  event: "event campaign",
}

function clean(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

function clip(value: string, max: number): string {
  return clean(value).slice(0, max)
}

export function buildEmailCampaignContentBrief(input: EmailCampaignWorkflowInput): ContentAgentBrief {
  const objective = clip(input.objective, 120)
  const keyMessage = clip(input.keyMessage, 150)
  const constraints = clip(input.constraints ?? "", 80)
  const sequenceLength = Number.parseInt(input.sequenceLength, 10)

  const goal = [
    "DRAFT ONLY. Create a human-reviewed email sequence; do not send, schedule, enroll contacts, scrape addresses, or claim consent.",
    `Write ${sequenceLength} distinct emails for a ${TYPE_LABELS[input.campaignType]}.`,
    `Objective: ${objective}.`,
    `Key message: ${keyMessage}.`,
    constraints ? `Constraints: ${constraints}.` : "",
    "Label each email clearly with subject and body. Avoid fabricated results, fake scarcity, unsupported urgency, or guarantees.",
  ].filter(Boolean).join(" ").slice(0, 500)

  const offer = clip(input.offer ?? "", 500)

  return {
    businessName: clip(input.businessName, 120),
    audience: clip(input.audience, 500),
    goal,
    channel: "email",
    tone: input.tone,
    ...(offer ? { offer } : {}),
  }
}
