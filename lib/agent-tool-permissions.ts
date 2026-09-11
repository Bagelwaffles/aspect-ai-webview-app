export const agentToolPermissionIds = [
  "workspace.read",
  "assets.read",
  "assets.write",
  "web.search",
  "drive.read",
  "drive.write",
  "youtube.read",
  "youtube.publish",
  "social.read",
  "social.publish",
  "shopify.read",
  "shopify.write",
  "wordpress.read",
  "wordpress.publish",
  "slack.read",
  "slack.send",
  "business-profile.read",
  "business-profile.write",
] as const

export type AgentToolPermissionId = (typeof agentToolPermissionIds)[number]

export type AgentToolRisk = "read" | "write" | "publish"

export const agentToolPermissionRegistry: Record<
  AgentToolPermissionId,
  { label: string; risk: AgentToolRisk; approvalRequiredByDefault: boolean }
> = {
  "workspace.read": {
    label: "Read saved customer workspace context",
    risk: "read",
    approvalRequiredByDefault: false,
  },
  "assets.read": {
    label: "Read customer-selected private assets",
    risk: "read",
    approvalRequiredByDefault: false,
  },
  "assets.write": {
    label: "Create or replace customer workspace files",
    risk: "write",
    approvalRequiredByDefault: true,
  },
  "web.search": {
    label: "Search the public web and return source metadata",
    risk: "read",
    approvalRequiredByDefault: false,
  },
  "drive.read": {
    label: "Read customer-selected Google Drive files",
    risk: "read",
    approvalRequiredByDefault: false,
  },
  "drive.write": {
    label: "Create or modify Google Drive files",
    risk: "write",
    approvalRequiredByDefault: true,
  },
  "youtube.read": {
    label: "Read YouTube channel/video metadata",
    risk: "read",
    approvalRequiredByDefault: false,
  },
  "youtube.publish": {
    label: "Upload or publish YouTube content",
    risk: "publish",
    approvalRequiredByDefault: true,
  },
  "social.read": {
    label: "Read permitted social account/page metadata",
    risk: "read",
    approvalRequiredByDefault: false,
  },
  "social.publish": {
    label: "Publish or modify social content",
    risk: "publish",
    approvalRequiredByDefault: true,
  },
  "shopify.read": {
    label: "Read Shopify catalog/store data",
    risk: "read",
    approvalRequiredByDefault: false,
  },
  "shopify.write": {
    label: "Create or modify Shopify store data",
    risk: "write",
    approvalRequiredByDefault: true,
  },
  "wordpress.read": {
    label: "Read WordPress content/site metadata",
    risk: "read",
    approvalRequiredByDefault: false,
  },
  "wordpress.publish": {
    label: "Create, update, or publish WordPress content",
    risk: "publish",
    approvalRequiredByDefault: true,
  },
  "slack.read": {
    label: "Read permitted Slack channel content",
    risk: "read",
    approvalRequiredByDefault: false,
  },
  "slack.send": {
    label: "Send Slack messages",
    risk: "publish",
    approvalRequiredByDefault: true,
  },
  "business-profile.read": {
    label: "Read Google Business Profile data",
    risk: "read",
    approvalRequiredByDefault: false,
  },
  "business-profile.write": {
    label: "Modify Google Business Profile data",
    risk: "write",
    approvalRequiredByDefault: true,
  },
}

export const customerConnectionPermissionMap = {
  "google-drive": ["drive.read", "drive.write"],
  youtube: ["youtube.read", "youtube.publish"],
  facebook: ["social.read", "social.publish"],
  instagram: ["social.read", "social.publish"],
  linkedin: ["social.read", "social.publish"],
  shopify: ["shopify.read", "shopify.write"],
  wordpress: ["wordpress.read", "wordpress.publish"],
  slack: ["slack.read", "slack.send"],
  "google-business-profile": ["business-profile.read", "business-profile.write"],
} satisfies Record<string, AgentToolPermissionId[]>
