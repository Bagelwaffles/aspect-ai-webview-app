export async function GET() {
  try {
    const response = await fetch(`${process.env.RELEVANCE_AGENT_API_URL}/agents`, {
      headers: {
        Authorization: `Bearer ${process.env.RELEVANCE_AUTH_TOKEN}`,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      throw new Error("Failed to fetch agents")
    }

    const agents = await response.json()
    return Response.json({ success: true, agents })
  } catch (error) {
    console.error("Error fetching agents:", error)
    return Response.json({ success: false, error: "Failed to fetch agents" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, description, instructions, model = "gpt-4" } = body

    const response = await fetch(`${process.env.RELEVANCE_AGENT_API_URL}/agents`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RELEVANCE_AUTH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        description,
        instructions,
        model,
        project_id: process.env.RELEVANCE_PROJECT_ID,
      }),
    })

    if (!response.ok) {
      throw new Error("Failed to create agent")
    }

    const agent = await response.json()
    return Response.json({ success: true, agent })
  } catch (error) {
    console.error("Error creating agent:", error)
    return Response.json({ success: false, error: "Failed to create agent" }, { status: 500 })
  }
}
