"use client"

import { useRouter } from "next/navigation"

export default function DashboardPage() {
  const router = useRouter()

  const handleViewWorkflows = () => {
    // Navigate to n8n workflows or trigger workflow management
    console.log("[v0] View Workflows clicked")
    // For now, show alert - can be replaced with actual workflow management
    alert("n8n Workflows feature coming soon!")
  }

  const handleViewProducts = () => {
    // Navigate to Printify products management
    console.log("[v0] View Products clicked")
    alert("Printify Products feature coming soon!")
  }

  const handleManageBilling = () => {
    // Navigate to billing/subscription management
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
            <h3 className="text-xl font-semibold mb-3">n8n Workflows</h3>
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
