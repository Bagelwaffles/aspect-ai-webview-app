import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { name, email, password } = await request.json()

    // Basic validation
    if (!name || !email || !password) {
      return NextResponse.json({ error: "Name, email, and password are required" }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 })
    }

    // In a real app, you would:
    // 1. Hash the password
    // 2. Check if user already exists
    // 3. Save to database
    // 4. Send verification email
    // 5. Create JWT token

    // For now, simulate user creation
    const userData = {
      id: Date.now().toString(),
      name,
      email,
      createdAt: new Date().toISOString(),
      credits: 100, // Give new users 100 free credits
      subscription: "free",
    }

    // Trigger n8n workflow for new user setup
    try {
      const n8nResponse = await fetch(`${process.env.N8N_BASE_URL}/${process.env.N8N_WEBHOOK_PATH}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.N8N_WEBHOOK_SECRET}`,
        },
        body: JSON.stringify({
          action: "user.created",
          user: userData,
        }),
      })

      if (!n8nResponse.ok) {
        console.error("Failed to trigger n8n user creation workflow")
      }
    } catch (error) {
      console.error("Error triggering n8n workflow:", error)
    }

    return NextResponse.json({
      success: true,
      message: "Account created successfully",
      user: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        credits: userData.credits,
      },
    })
  } catch (error) {
    console.error("Signup error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
