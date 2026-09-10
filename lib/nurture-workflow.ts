export type NurtureType = "welcome" | "onboarding" | "follow-up" | "retention" | "re-engagement"
export type NurtureLength = "3" | "5" | "7"
export type NurtureTone = "professional" | "friendly" | "confident" | "educational" | "conversational"

type NurtureInput = {
  businessName: string
  audience: string
  campaignType: NurtureType
  sequenceLength: NurtureLength
  objective: string
  keyMessage: string
  tone: NurtureTone
  offer?: string
  constraints?: string
}

const stages = ["welcome", "onboarding", "follow-up", "retention", "re-engagement"]
const clean = (value: string, max: number) => value.trim().replace(/\s+/g, " ").slice(0, max)

export function buildNurtureContentBrief(input: NurtureInput) {
  if (!stages.includes(input.campaignType) || !["3", "5", "7"].includes(input.sequenceLength)) {
    throw new Error("Unsupported nurture stage or sequence length")
  }
  // Reserve space for all operating boundaries before adding customer context.
  const goal = `DRAFT ONLY: ${input.sequenceLength} ${input.campaignType} emails. No sending, scheduling, enrollment, address collection or assumed consent. Include subject, body, suggested timing and opt-out reminder. Stop on opt-out or reply; human review required. No fabricated claims. Goal: ${clean(input.objective, 65)}. Message: ${clean(input.keyMessage, 65)}. Limits: ${clean(input.constraints ?? "", 45)}.`
  return {
    businessName: clean(input.businessName, 120),
    audience: clean(input.audience, 500),
    goal,
    channel: "email" as const,
    tone: input.tone,
    ...(clean(input.offer ?? "", 500) ? { offer: clean(input.offer ?? "", 500) } : {}),
  }
}
