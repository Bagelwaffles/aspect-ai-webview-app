"use client"

import { useEffect, useMemo, useState } from "react"
import { Activity, Clock, Play, Pause, Workflow } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type LiveWorkflow = {
  id: string
  name: string
  description?: string
  status?: string
  triggers?: string[]
  steps?: unknown[]
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<LiveWorkflow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    fetch("/api/relevance/workflows", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!mounted) return
        setWorkflows(Array.isArray(data?.workflows) ? data.workflows : [])
      })
      .catch((error) => {
        console.error("Failed to fetch live workflows:", error)
        if (mounted) setWorkflows([])
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  const activeWorkflows = useMemo(
    () => workflows.filter((workflow) => workflow.status === "active").length,
    [workflows],
  )

  const totalSteps = useMemo(
    () => workflows.reduce((sum, workflow) => sum + (workflow.steps?.length || 0), 0),
    [workflows],
  )

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Workflow className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-card-foreground font-[family-name:var(--font-work-sans)]">
                Workflow Automation
              </h1>
              <p className="text-sm text-muted-foreground">Live workflow definitions from the connected API</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => (window.location.href = "/")}>
            Dashboard
          </Button>
        </div>
      </div>

      <div className="p-6">
        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Workflows</CardTitle>
              <Workflow className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{loading ? "Loading..." : activeWorkflows.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">{workflows.length} live workflows total</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Steps</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{loading ? "Loading..." : totalSteps.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Across live workflow definitions</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Status</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">Live</div>
              <p className="text-xs text-muted-foreground">No mock workflow data is shown</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Live Workflow Definitions</CardTitle>
            <CardDescription>
              When the API has no workflows yet, we show that honestly instead of inventing demo content.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {workflows.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                No live workflows are connected yet.
              </div>
            ) : (
              workflows.map((workflow) => (
                <div key={workflow.id} className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="font-medium">{workflow.name}</p>
                    <p className="text-sm text-muted-foreground">{workflow.description || "Live workflow"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={workflow.status === "active" ? "default" : "secondary"}>
                      {workflow.status || "draft"}
                    </Badge>
                    <Button variant="ghost" size="sm">
                      {workflow.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
