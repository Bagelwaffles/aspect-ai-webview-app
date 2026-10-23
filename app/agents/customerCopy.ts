import type { Agent } from "./agentCatalog"

/** Customer-visible summaries only. Engineering evidence stays in owner operations. */
const summaries: Record<string, string> = {
  "content-agent": "Create marketing copy, product descriptions, emails, and social posts faster.",
  "ams-fiverr-bridge": "Organize inquiries and opportunities from your freelance services.",
  "aspect-overmind": "Keep business tasks organized across your AMS tools.",
  "youtube-uploader-agent": "Organize approved videos and Shorts for YouTube.",
  "social-publisher-agent": "Plan social posts and prepare content for your approval.",
  "android-build-agent": "Help plan mobile app launch and publishing tasks.",
  "lead-magnet-agent": "Create valuable free resources that help attract new leads.",
  "nurture-agent": "Write useful follow-up messages for leads and customers.",
  "outreach-agent": "Prepare personal prospect messages for your approval.",
  "seo-agent": "Improve website content so customers can find your business.",
  "analytics-agent": "Understand your business performance with clear summaries.",
  "n8n-automation-agent": "Simplify repetitive business tasks and handoffs.",
  "shopify-agent": "Organize products and merchandising for your online store.",
  "twitch-watcher-agent": "Turn streams into recaps and ideas for future content.",
  "automation-builder": "Explore ways to simplify your everyday business work.",
  "customer-support-agent": "Keep customer questions organized and prepare helpful replies.",
  "technical-support-agent": "Organize troubleshooting and support requests.",
  "notifier-agent": "See important business updates in one place.",
  "slack-agent": "Organize your team's messages and reminders.",
  "telegram-agent": "Stay on top of messages and important updates.",
  "research-agent": "Compare information and turn it into useful summaries.",
  "web-scraper-agent": "Gather public information for research and business decisions.",
  "reverse-engineering-intelligence-agent": "Track changes in tools that matter to your business.",
  "agi-research-bot": "Understand AI trends and how they could affect your marketing.",
  "console-builder": "Explore ways to organize your business activity."
}
export const customerAgentDescription = (agent: Agent): string => summaries[agent.slug] ?? agent.description
export const customerOfferDescription = (agent: Agent): string =>
  agent.status === "live" ? "Check the listed AMS plan or offer for current ordering options and included usage." :
  agent.status === "beta" ? "Limited preview. This service is not available for general purchase." :
  "Not available for purchase yet. Check back for updates."
