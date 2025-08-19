import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    // Basic validation
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 })
    }

    // In a real app, you would:
    // 1. Look up user in database
    // 2. Verify password hash
    // 3. Create JWT token
    // 4. Return user data

    // For now, simulate login validation
    // In production, replace with actual authentication logic
    if (email && password.length >= 8) {
      const userData = {
        id: Date.now().toString(),
        name: email.split("@")[0], // Use email prefix as name for demo
        email,
        credits: 250, // Demo credits
        subscription: "pro",
      }

      return NextResponse.json({
        success: true,
        message: "Login successful",
        user: userData,
      })
    } else {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }
  } catch (error) {
    console.error("Login error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
