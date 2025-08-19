"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { LayoutDashboard, CreditCard, Bot, Workflow, Settings, LogOut, Menu, X, Zap, Activity } from "lucide-react"
import { useRouter } from "next/navigation"

interface SidebarProps {
  currentPage: string
  onPageChange: (page: string) => void
}

export function Sidebar({ currentPage, onPageChange }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const router = useRouter()

  const handleLogout = () => {
    localStorage.removeItem("isAuthenticated")
    localStorage.removeItem("userEmail")
    router.push("/")
  }

  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "billing", label: "Billing", icon: CreditCard },
    { id: "credits", label: "Credits", icon: Zap },
    { id: "assistant", label: "AI Assistant", icon: Bot },
    { id: "workflows", label: "Workflows", icon: Workflow },
    { id: "monitoring", label: "Monitoring", icon: Activity },
    { id: "settings", label: "Settings", icon: Settings },
  ]

  return (
    <div
      className={`bg-sidebar border-r border-sidebar-border transition-all duration-300 ${isCollapsed ? "w-16" : "w-64"} flex flex-col h-full`}
    >
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center justify-between">
          {!isCollapsed && (
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-sidebar-accent rounded-full flex items-center justify-center">
                <span className="text-sidebar-accent-foreground font-bold text-sm">A</span>
              </div>
              <span className="font-semibold text-sidebar-foreground">Aspect Marketing</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-sidebar-foreground hover:bg-sidebar-accent"
          >
            {isCollapsed ? <Menu className="h-4 w-4" /> : <X className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Credits Display */}
      {!isCollapsed && (
        <div className="p-4">
          <Card className="bg-sidebar-primary border-sidebar-border">
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-sidebar-primary-foreground">Credits</span>
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <div className="text-2xl font-bold text-sidebar-primary-foreground">1,250</div>
              <Badge variant="secondary" className="text-xs mt-1">
                Pro Plan
              </Badge>
            </div>
          </Card>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <div className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon
            const isActive = currentPage === item.id

            return (
              <Button
                key={item.id}
                variant={isActive ? "secondary" : "ghost"}
                className={`w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent ${
                  isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""
                } ${isCollapsed ? "px-2" : ""}`}
                onClick={() => onPageChange(item.id)}
              >
                <Icon className="h-4 w-4" />
                {!isCollapsed && <span className="ml-2">{item.label}</span>}
              </Button>
            )
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border">
        <Button
          variant="ghost"
          className={`w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent ${isCollapsed ? "px-2" : ""}`}
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          {!isCollapsed && <span className="ml-2">Logout</span>}
        </Button>
      </div>
    </div>
  )
}
