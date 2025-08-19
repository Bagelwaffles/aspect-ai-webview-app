"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Sidebar } from "@/components/dashboard/sidebar"
import { DashboardOverview } from "@/components/dashboard/dashboard-overview"
import { BillingOverview } from "@/components/dashboard/billing-overview"
import { CreditsManagement } from "@/components/dashboard/credits-management"
import { AIAssistant } from "@/components/dashboard/ai-assistant"
import { WorkflowManagement } from "@/components/dashboard/workflow-management"
import { SystemMonitoring } from "@/components/dashboard/system-monitoring"

export default function DashboardPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [currentPage, setCurrentPage] = useState("dashboard")
  const router = useRouter()

  useEffect(() => {
    const authStatus = localStorage.getItem("isAuthenticated")
    if (!authStatus) {
      router.push("/login")
    } else {
      setIsAuthenticated(true)
    }
  }, [router])

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground">Loading...</div>
      </div>
    )
  }

  const renderContent = () => {
    switch (currentPage) {
      case "dashboard":
        return <DashboardOverview />
      case "billing":
        return <BillingOverview />
      case "credits":
        return <CreditsManagement />
      case "assistant":
        return <AIAssistant />
      case "workflows":
        return <WorkflowManagement />
      case "monitoring":
        return <SystemMonitoring />
      case "settings":
        return <div className="text-foreground">Settings content coming soon...</div>
      default:
        return <DashboardOverview />
    }
  }

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar currentPage={currentPage} onPageChange={setCurrentPage} />
      <main className="flex-1 p-6">{renderContent()}</main>
    </div>
  )
}
