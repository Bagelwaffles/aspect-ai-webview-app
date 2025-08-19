import { type NextRequest, NextResponse } from "next/server"
import { generateText } from "ai"
import { xai } from "@ai-sdk/openai"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { assistantId, message, metadata, userId } = body

    console.log("[v0] AI assistant request:", { assistantId, message: message?.substring(0, 100), userId })

    // Check if user has sufficient credits
    const creditsResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/credits/use`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: userId || "user_123",
        amount: 5, // 5 credits per AI query
        reason: "AI Assistant Query",
        workflowId: assistantId,
      }),
    })

    const creditsResult = await creditsResponse.json()
    if (!creditsResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Insufficient credits",
          creditsRequired: 5,
        },
        { status: 402 },
      )
    }

    let aiResponse: string

    // Route to appropriate AI service based on assistantId
    if (assistantId === "grok" || assistantId?.includes("grok")) {
      // Use Grok via XAI
      const { text } = await generateText({
        model: xai("grok-beta"),
        prompt: message,
        system:
          "You are AspectBot, an AI assistant for Aspect Marketing Solutions. Help users with marketing automation, workflow creation, and business growth strategies.",
      })
      aiResponse = text
    } else {
      // Use Relevance AI (fallback to mock for demo)
      try {
        const relevanceResponse = await fetch(process.env.RELEVANCE_AGENT_API_URL || "", {
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

        if (relevanceResponse.ok) {
          const relevanceData = await relevanceResponse.json()
          aiResponse = relevanceData.response || relevanceData.message || "I'm here to help with your marketing needs!"
        } else {
          throw new Error("Relevance AI unavailable")
        }
      } catch (error) {
        console.log("[v0] Relevance AI fallback to Grok:", error)
        // Fallback to Grok
        const { text } = await generateText({
          model: xai("grok-beta"),
          prompt: message,
          system:
            "You are AspectBot, an AI assistant for Aspect Marketing Solutions. Help users with marketing automation, workflow creation, and business growth strategies.",
        })
        aiResponse = text
      }
    }

    const response = {
      success: true,
      response: aiResponse,
      assistantId: assistantId || "AspectBot",
      creditsUsed: 5,
      remainingCredits: creditsResult.newBalance,
      timestamp: new Date().toISOString(),
    }

    console.log("[v0] AI assistant response generated successfully")

    return NextResponse.json(response)
  } catch (error) {
    console.error("[v0] AI assistant error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to process AI request",
        message: "I'm sorry, I'm having trouble processing your request right now. Please try again later.",
      },
      { status: 500 },
    )
  }
}
