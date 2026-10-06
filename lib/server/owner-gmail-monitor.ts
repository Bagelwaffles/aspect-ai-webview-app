import { createHash } from "node:crypto"
import { z } from "zod"
import { gmailAccessToken, type GmailContext, type GmailSlot } from "./owner-gmail"
import type { TaskResult, TaskState } from "./scheduled-task-engine"
const BUSINESS = /aspect marketing|ams[_ -]quick|quick marketing audit|aspectmarketingsolutions|google play|play console/iu
const categories = ["order", "payment", "customer", "google-play", "security", "account"] as const
const messageSchema = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/u), internalDate: z.string(), payload: z.object({ headers: z.array(z.object({ name: z.string(), value: z.string() })) }) })
export function classifyGmailMetadata(headers: { name: string; value: string }[], terms: string[] = []): typeof categories[number] | null {
  const header = (name: string) => headers.find(item => item.name.toLowerCase() === name)?.value ?? ""
  const subject = header("subject"), from = header("from")
  const securityProvider = /@(?:accounts\.google\.com|google\.com)>?$/iu.test(from.trim())
  if (securityProvider && /security alert|critical security|password changed|new sign.in/iu.test(subject)) return "security"
  if (!BUSINESS.test(`${subject} ${from}`) && !terms.some(term => `${subject} ${from}`.toLowerCase().includes(term.toLowerCase()))) return null
  if (/google play|play console/iu.test(`${subject} ${from}`)) return "google-play"
  if (/failed payment|payment|paid|invoice|receipt/iu.test(subject)) return "payment"
  if (/order|purchase|audit sale/iu.test(subject)) return "order"
  if (/inquiry|enquiry|question|revision|buyer|customer/iu.test(subject)) return "customer"
  return "account"
}
const continuationSchema = z.object({ windowStart: z.number(), windowEnd: z.number(), nextPageToken: z.string().max(2048).nullable(), checkpoint: z.number(), alerts: z.array(z.object({ id: z.string(), category: z.enum(categories), receivedAt: z.string() })) })
export async function runGmailMonitor(slot: GmailSlot, state: TaskState, now: Date, input: GmailContext = {}): Promise<TaskResult> {
  const token = await gmailAccessToken(slot, input), fetcher = input.fetcher ?? fetch
  const env = input.env ?? process.env
  const terms = (env[slot === "primary" ? "AMS_GMAIL_PRIMARY_BUSINESS_TERMS" : "AMS_GMAIL_SECONDARY_BUSINESS_TERMS"] ?? "").split(",").map(term => term.trim()).filter(Boolean)
  if (terms.length > 20 || terms.some(term => !/^[A-Za-z0-9 ._-]{3,80}$/u.test(term))) throw new Error("GMAIL_BUSINESS_FILTER_INVALID")
  const prior = state.history.find(run => run.status === "succeeded" && run.result)?.result?.details
  const previous = continuationSchema.safeParse(prior)
  const continuing = previous.success && previous.data.nextPageToken !== null
  const checkpoint = previous.success ? previous.data.checkpoint : now.getTime() - 86400_000
  const windowStart = continuing ? previous.data.windowStart : Math.max(0, checkpoint - 300_000)
  const windowEnd = continuing ? previous.data.windowEnd : now.getTime()
  const query = `in:anywhere -in:spam -in:trash after:${Math.floor(windowStart / 1000)} before:${Math.ceil(windowEnd / 1000)} {"aspect marketing" "quick marketing audit" "aspectmarketingsolutions" "fiverr" "google play" "play console" "stripe" from:accounts.google.com subject:"security alert" ${terms.map(term => `"${term}"`).join(" ")}}`
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages")
  url.searchParams.set("q", query); url.searchParams.set("maxResults", "25")
  if (continuing && previous.success) url.searchParams.set("pageToken", previous.data.nextPageToken!)
  const read = async (url: string) => {
    const response = await fetcher(url, { headers: { Authorization: `Bearer ${token}` }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8_000) })
    if (!response.ok) throw new Error(response.status === 401 ? "GMAIL_REAUTHORIZE_REQUIRED" : "GMAIL_MONITOR_UNAVAILABLE")
    return response.json()
  }
  const page = z.object({ messages: z.array(z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/u) })).max(25).default([]), nextPageToken: z.string().max(2048).optional() }).parse(await read(url.toString()))
  const alerts: z.infer<typeof continuationSchema>["alerts"] = [], discoveries: string[] = []
  // Five bounded reads at a time; no bodies, snippets, attachments or AI ingestion.
  for (let start = 0; start < page.messages.length; start += 5) {
    const batch = await Promise.all(page.messages.slice(start, start + 5).map(async ({ id }) => {
      const discovery = `gmail:${slot}:${createHash("sha256").update(id).digest("hex")}`
      if (state.findings.includes(discovery)) return null
      const messageUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`)
      messageUrl.searchParams.set("format", "metadata")
      for (const name of ["From", "Subject"]) messageUrl.searchParams.append("metadataHeaders", name)
      const message = messageSchema.parse(await read(messageUrl.toString()))
      if (message.id !== id) throw new Error("GMAIL_MESSAGE_ID_INVALID")
      const timestamp = Number(message.internalDate)
      if (!Number.isFinite(timestamp) || timestamp < windowStart || timestamp > windowEnd) return null
      const category = classifyGmailMetadata(message.payload.headers, terms)
      return { discovery, alert: category ? { id, category, receivedAt: new Date(timestamp).toISOString() } : null }
    }))
    for (const item of batch) if (item) { discoveries.push(item.discovery); if (item.alert) alerts.push(item.alert) }
  }
  return { summary: alerts.length ? `${alerts.length} relevant ${slot} Gmail notification(s) require owner review.` : `No new relevant ${slot} Gmail notifications.`, details: { windowStart, windowEnd, nextPageToken: page.nextPageToken ?? null, checkpoint: page.nextPageToken ? checkpoint : windowEnd, alerts }, discoveries, alert: alerts.length > 0, dataQuality: page.nextPageToken ? "partial" : "verified" }
}
