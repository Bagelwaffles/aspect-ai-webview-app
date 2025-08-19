"use client"

import { useState } from "react"

export default function PricingPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubscribe = async () => {
    setLoading(true)
    setError(null)

    console.log("[v0] Starting checkout process")

    try {
      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID,
        }),
      })

      console.log("[v0] Checkout response status:", response.status)

      if (!response.ok) {
        const errorData = await response.json()
        console.log("[v0] Checkout error:", errorData)
        throw new Error(errorData.error || `Failed to create session: ${response.status}`)
      }

      const { url } = await response.json()
      console.log("[v0] Redirecting to:", url)

      if (url) {
        window.location.href = url
      } else {
        throw new Error("No checkout URL received")
      }
    } catch (err) {
      console.error("[v0] Checkout error:", err)
      const errorMessage = err instanceof Error ? err.message : "Unknown error occurred"

      // Check for specific setup errors
      if (errorMessage.includes("STRIPE_SECRET_KEY")) {
        setError(
          "Setup Required: Please add your STRIPE_SECRET_KEY to environment variables. Get it from your Stripe Dashboard > Developers > API keys.\n\nAdd these values to your .env file or Project Settings → Environment Variables",
        )
      } else if (errorMessage.includes("STRIPE_PRICE_ID")) {
        setError(
          "Setup Required: Please add your STRIPE_PRICE_ID to environment variables. Create a subscription price in your Stripe Dashboard > Products.\n\nAdd these values to your .env file or Project Settings → Environment Variables",
        )
      } else {
        setError(`Error: ${errorMessage}`)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 py-16">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Choose Your Plan</h1>
          <p className="text-xl text-gray-600">Get started with our powerful automation platform</p>
        </div>

        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Pro Plan</h3>
              <div className="text-4xl font-bold text-blue-600 mb-2">$29</div>
              <div className="text-gray-500">per month</div>
            </div>

            <ul className="space-y-4 mb-8">
              <li className="flex items-center">
                <svg className="w-5 h-5 text-green-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                n8n Workflow Automation
              </li>
              <li className="flex items-center">
                <svg className="w-5 h-5 text-green-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                Printify Integration
              </li>
              <li className="flex items-center">
                <svg className="w-5 h-5 text-green-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                Priority Support
              </li>
            </ul>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="text-red-800 text-sm whitespace-pre-line">{error}</div>
              </div>
            )}

            <button
              onClick={handleSubscribe}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Processing..." : "Subscribe Now"}
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}
