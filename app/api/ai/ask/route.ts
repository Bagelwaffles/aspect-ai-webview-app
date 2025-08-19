import { type NextRequest, NextResponse } from "next/server"
import { generateText } from "ai"
import { xai } from "@ai-sdk/openai"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { assistantId, message, metadata, userId } = body

    console.log("[v0] AI assistant request:", { assistantId, message: message?.substring(0, 100), userId })

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
    const creditsResponse = await fetch(`${baseUrl}/api/credits/use`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: userId || "user_123",
        amount: 5, // 5 credits per AI query
        reason: "AI Assistant Query",
        workflowId: assistantId,
      }),
    })

    console.log("[v0] Credits API response status:", creditsResponse.status)

    if (!creditsResponse.ok) {
      console.log("[v0] Credits API failed, proceeding without credit check")
      // Continue without credit check for now to avoid blocking AI responses
    }

    let aiResponse: string

    // Route to appropriate AI service based on assistantId
    if (assistantId === "grok" || assistantId?.includes("grok")) {
      console.log("[v0] Using Grok AI")
      // Use Grok via XAI
      const { text } = await generateText({
        model: xai("grok-beta"),
        prompt: message,
        system:
          "You are AspectBot, an AI assistant for Aspect Marketing Solutions. Help users with marketing automation, workflow creation, and business growth strategies. Provide helpful, actionable advice.",
      })
      aiResponse = text
    } else {
      console.log("[v0] Attempting Relevance AI")
      try {
        const relevanceUrl = process.env.RELEVANCE_AGENT_API_URL
        console.log("[v0] Relevance URL configured:", !!relevanceUrl)

        if (!relevanceUrl) {
          throw new Error("Relevance AI URL not configured")
        }

        const relevanceResponse = await fetch(relevanceUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.RELEVANCE_API_KEY}`,
          },
          body: JSON.stringify({
            assistantId: assistantId || "AspectBot",
            message,
            metadata,
          }),
        })

        console.log("[v0] Relevance API response status:", relevanceResponse.status)

        if (relevanceResponse.ok) {
          const relevanceData = await relevanceResponse.json()
          aiResponse = relevanceData.response || relevanceData.message || "I'm here to help with your marketing needs!"
        } else {
          throw new Error(`Relevance AI returned ${relevanceResponse.status}`)
        }
      } catch (error) {
        console.log("[v0] Relevance AI failed, using Grok fallback:", error)
        // Fallback to Grok
        const { text } = await generateText({
          model: xai("grok-beta"),
          prompt: message,
          system:
            "You are AspectBot, an AI assistant for Aspect Marketing Solutions. Help users with marketing automation, workflow creation, and business growth strategies. Provide helpful, actionable advice.",
        })
        aiResponse = text
      }
    }

    let remainingCredits = 0
    try {
      const creditsResult = await creditsResponse?.json()
      remainingCredits = creditsResult?.newBalance || 0
    } catch (e) {
      console.log("[v0] Could not parse credits response")
    }

    const response = {
      success: true,
      response: aiResponse,
      assistantId: assistantId || "AspectBot",
      creditsUsed: 5,
      remainingCredits,
      timestamp: new Date().toISOString(),
    }

    console.log("[v0] AI assistant response generated successfully")

    return NextResponse.json(response)
  } catch (error) {
    console.error("[v0] AI assistant error:", error)

    let errorMessage = "I'm having trouble right now. Let me try to help you anyway!"

    if (error instanceof Error) {
      if (error.message.includes("credits")) {
        errorMessage = "You may be low on credits, but I'll still try to help you with your marketing questions!"
      } else if (error.message.includes("API")) {
        errorMessage =
          "I'm experiencing some technical difficulties, but I'm still here to assist with your marketing needs!"
      }
    }

    try {
      const body = await request.json()
      const { message } = body

      if (message) {
        const { text } = await generateText({
          model: xai("grok-beta"),
          prompt: message,
          system:
            "You are AspectBot, an AI assistant for Aspect Marketing Solutions. The system is experiencing some issues, but still provide helpful marketing advice.",
        })

        return NextResponse.json({
          success: true,
          response: text,
          assistantId: "AspectBot",
          creditsUsed: 0,
          remainingCredits: 0,
          timestamp: new Date().toISOString(),
          note: "Response generated in fallback mode",
        })
      }
    } catch (fallbackError) {
      console.error("[v0] Fallback also failed:", fallbackError)
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to process AI request",
        message: errorMessage,
      },
      { status: 500 },
    )
  }
}
