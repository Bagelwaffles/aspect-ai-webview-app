"use client"

import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"

export default function DashboardPage() {
  const router = useRouter()
  const [workflows, setWorkflows] = useState<any[]>([])
  const [shops, setShops] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [n8nConnected, setN8nConnected] = useState<boolean | null>(null)

  useEffect(() => {
    checkN8nConnection()
    fetchWorkflows()
    fetchShops()
  }, [])

  const checkN8nConnection = async () => {
    try {
      const response = await fetch("/api/n8n/status")
      const data = await response.json()
      setN8nConnected(data.connected)

      if (!data.connected) {
        console.log("[v0] n8n not connected:", data.message)
      }
    } catch (error) {
      console.error("[v0] Error checking n8n connection:", error)
      setN8nConnected(false)
    }
  }

  const fetchWorkflows = async () => {
    try {
      setLoading(true)
      console.log("[v0] Fetching workflows from n8n")
      const response = await fetch("/api/agents/workflows")
      const data = await response.json()

      if (data.success) {
        setWorkflows(data.workflows || [])
        console.log("[v0] Workflows fetched successfully:", data.workflows?.length || 0)
      } else {
        console.log("[v0] Failed to fetch workflows:", data.error)
        if (data.error?.includes("n8n configuration missing")) {
          console.log(
            "[v0] Failed to fetch workflows: n8n configuration missing. Please set N8N_BASE_URL, N8N_WEBHOOK_PATH, and N8N_WEBHOOK_SECRET environment variables.",
          )
        }
      }
    } catch (error) {
      console.error("[v0] Error fetching workflows:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchShops = async () => {
    try {
      console.log("[v0] Fetching shops from n8n")
      const response = await fetch("/api/agents/shops")
      const data = await response.json()

      if (data.success) {
        setShops(data.shops || [])
        console.log("[v0] Shops fetched successfully:", data.shops?.length || 0)
      } else {
        console.log("[v0] Failed to fetch shops:", data.error)
        if (data.error?.includes("n8n configuration missing")) {
          console.log(
            "[v0] Failed to fetch shops: n8n configuration missing. Please set N8N_BASE_URL, N8N_WEBHOOK_PATH, and N8N_WEBHOOK_SECRET environment variables.",
          )
        }
      }
    } catch (error) {
      console.error("[v0] Error fetching shops:", error)
    }
  }

  const handleViewWorkflows = async () => {
    console.log("[v0] View Workflows clicked")

    if (n8nConnected === false) {
      alert(
        "n8n is not connected. Please add these environment variables to your Vercel project:\n\n" +
          "• N8N_BASE_URL=https://flow.aspectmarketingsolutions.app\n" +
          "• N8N_WEBHOOK_PATH=/webhook/vo-app\n" +
          "• N8N_WEBHOOK_SECRET=<your-secret-key>",
      )
      return
    }

    if (n8nConnected === null) {
      alert("Checking n8n connection status...")
      return
    }

    if (workflows.length === 0) {
      alert("No workflows found. Please check your n8n configuration.")
      return
    }

    const workflowList = workflows.map((w) => `• ${w.name || w.id}`).join("\n")
    const shouldTrigger = confirm(`Available workflows:\n${workflowList}\n\nWould you like to trigger a workflow?`)

    if (shouldTrigger && workflows.length > 0) {
      try {
        const response = await fetch("/api/agents/workflows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workflowId: workflows[0].id,
            action: "trigger",
            data: { source: "dashboard" },
          }),
        })

        const result = await response.json()
        if (result.success) {
          alert("Workflow triggered successfully!")
        } else {
          alert(`Failed to trigger workflow: ${result.error}`)
        }
      } catch (error) {
        alert("Error triggering workflow")
      }
    }
  }

  const handleViewProducts = () => {
    console.log("[v0] View Products clicked")

    if (n8nConnected === false) {
      alert(
        "n8n is not connected. Please add these environment variables to your Vercel project:\n\n" +
          "• N8N_BASE_URL=https://flow.aspectmarketingsolutions.app\n" +
          "• N8N_WEBHOOK_PATH=/webhook/vo-app\n" +
          "• N8N_WEBHOOK_SECRET=<your-secret-key>",
      )
      return
    }

    if (shops.length === 0) {
      alert("No Printify shops found. Please check your n8n workflow configuration.")
      return
    }

    const shopList = shops.map((s) => `• ${s.title || s.name || s.id}`).join("\n")
    alert(`Connected Printify shops:\n${shopList}`)
  }

  const handleManageBilling = () => {
    console.log("[v0] Manage Billing clicked")
    router.push("/pricing")
  }

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
          <p className="text-gray-600">Manage your workflows and integrations</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xl font-semibold">n8n Workflows</h3>
              <div
                className={`w-3 h-3 rounded-full ${
                  n8nConnected === true ? "bg-green-500" : n8nConnected === false ? "bg-red-500" : "bg-yellow-500"
                }`}
                title={n8nConnected === true ? "Connected" : n8nConnected === false ? "Not Connected" : "Checking..."}
              ></div>
            </div>
            <p className="text-gray-600 mb-4">Trigger and manage your automation workflows</p>
            <button
              onClick={handleViewWorkflows}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
            >
              View Workflows
            </button>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold mb-3">Printify Products</h3>
            <p className="text-gray-600 mb-4">Manage your print-on-demand products</p>
            <button
              onClick={handleViewProducts}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors"
            >
              View Products
            </button>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold mb-3">Billing</h3>
            <p className="text-gray-600 mb-4">View your subscription and billing details</p>
            <button
              onClick={handleManageBilling}
              className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 transition-colors"
            >
              Manage Billing
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}
