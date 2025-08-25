import { generateText } from "ai"
import { xai } from "@ai-sdk/xai"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const { message } = await req.json()

    const { text } = await generateText({
      model: xai("grok-beta"),
      prompt: `You are an AI assistant for a print-on-demand business automation platform. The user has access to:
      - Printify integration for product creation
      - n8n workflows for automation
      - Stripe for billing
      - Real-time analytics and market data
      
      User message: ${message}
      
      Provide helpful, actionable insights about their print-on-demand business. Be concise but informative. Focus on automation opportunities, market trends, and business optimization.`,
    })

    return Response.json({ response: text })
  } catch (error) {
    console.error("AI Chat Error:", error)
    return Response.json({ error: "Failed to generate AI response" }, { status: 500 })
  }
}
