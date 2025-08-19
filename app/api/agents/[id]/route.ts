export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json()
    const { name, description, instructions, model } = body

    const response = await fetch(`${process.env.RELEVANCE_AGENT_API_URL}/agents/${params.id}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${process.env.RELEVANCE_AUTH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        description,
        instructions,
        model,
      }),
    })

    if (!response.ok) {
      throw new Error("Failed to update agent")
    }

    const agent = await response.json()
    return Response.json({ success: true, agent })
  } catch (error) {
    console.error("Error updating agent:", error)
    return Response.json({ success: false, error: "Failed to update agent" }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const response = await fetch(`${process.env.RELEVANCE_AGENT_API_URL}/agents/${params.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${process.env.RELEVANCE_AUTH_TOKEN}`,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      throw new Error("Failed to delete agent")
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error("Error deleting agent:", error)
    return Response.json({ success: false, error: "Failed to delete agent" }, { status: 500 })
  }
}
