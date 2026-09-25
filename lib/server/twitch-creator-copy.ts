function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function truncate(value: string, max: number) {
  const cleanValue = compactWhitespace(value)
  if (cleanValue.length <= max) return cleanValue
  return cleanValue.slice(0, Math.max(1, max - 1)).trimEnd() + "…"
}

export function personalizeTwitchCreatorCopy(value: string, creatorName: string) {
  const creator = truncate(creatorName || "SmokyBanana03", 80)
  const possessive = `${creator}’s`
  return value
    .replace(/\b(?:this|the)\s+streamer(?:'s|’s)\b/gi, possessive)
    .replace(/\bstreamer(?:'s|’s)\b/gi, possessive)
    .replace(/\b(?:this|the)\s+streamer\b/gi, creator)
    .replace(/\bstreamer\b/gi, creator)
}
