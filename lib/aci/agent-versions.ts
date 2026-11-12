// Version identifiers are part of the ACI knowledge namespace.
// Bump an agent's version when its behavior or knowledge contract materially changes.
export const ACI_AGENT_VERSIONS = {
  "content-agent": "content-v1",
} as const

export type AciAgentSlug = keyof typeof ACI_AGENT_VERSIONS
