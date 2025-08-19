"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Activity, Server, AlertTriangle, CheckCircle, RefreshCw } from "lucide-react"

interface HealthStatus {
  status: string
  timestamp: string
  uptime: number
  services: {
    database: ServiceHealth
    n8n: ServiceHealth
    stripe: ServiceHealth
    ai: ServiceHealth
  }
  metrics: {
    memoryUsage: {
      rss: number
      heapTotal: number
      heapUsed: number
      external: number
    }
  }
}

interface ServiceHealth {
  status: string
  responseTime?: number
  error?: string
  lastChecked: string
}

interface SystemStatus {
  application: {
    name: string
    version: string
    environment: string
    uptime: number
  }
  integrations: {
    stripe: boolean
    n8n: boolean
    xai: boolean
    relevance: boolean
  }
  metrics: {
    totalUsers: number
    activeWorkflows: number
    creditsProcessed: number
    apiCalls: number
  }
}

export function SystemMonitoring() {
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null)
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  useEffect(() => {
    fetchHealthData()
    fetchSystemStatus()

    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      fetchHealthData()
      fetchSystemStatus()
    }, 30000)

    return () => clearInterval(interval)
  }, [])

  const fetchHealthData = async () => {
    try {
      const response = await fetch("/api/health")
      const data = await response.json()
      setHealthStatus(data)
      setLastRefresh(new Date())
    } catch (error) {
      console.error("[v0] Failed to fetch health data:", error)
    }
  }

  const fetchSystemStatus = async () => {
    try {
      const response = await fetch("/api/system/status")
      const data = await response.json()
      setSystemStatus(data)
    } catch (error) {
      console.error("[v0] Failed to fetch system status:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRefresh = () => {
    setIsLoading(true)
    fetchHealthData()
    fetchSystemStatus()
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "bg-chart-4/20 text-chart-4"
      case "degraded":
        return "bg-chart-1/20 text-chart-1"
      case "unhealthy":
        return "bg-chart-3/20 text-chart-3"
      case "not_configured":
        return "bg-muted text-muted-foreground"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "healthy":
        return <CheckCircle className="h-4 w-4 text-chart-4" />
      case "degraded":
      case "unhealthy":
        return <AlertTriangle className="h-4 w-4 text-chart-3" />
      default:
        return <Activity className="h-4 w-4 text-muted-foreground" />
    }
  }

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)

    if (days > 0) return `${days}d ${hours}h ${minutes}m`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  const formatBytes = (bytes: number) => {
    const mb = bytes / 1024 / 1024
    return `${mb.toFixed(1)} MB`
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-foreground">Loading system status...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">System Monitoring</h1>
          <p className="text-muted-foreground">Monitor system health, performance, and service status</p>
        </div>
        <Button onClick={handleRefresh} disabled={isLoading}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Overall Status */}
      {healthStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center">
                {getStatusIcon(healthStatus.status)}
                <span className="ml-2">System Health</span>
              </div>
              <Badge className={getStatusColor(healthStatus.status)}>{healthStatus.status}</Badge>
            </CardTitle>
            <CardDescription>
              Last updated: {lastRefresh.toLocaleTimeString()} • Uptime: {formatUptime(healthStatus.uptime)}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Tabs defaultValue="services" className="space-y-4">
        <TabsList>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="services" className="space-y-4">
          {healthStatus && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Object.entries(healthStatus.services).map(([serviceName, service]) => (
                <Card key={serviceName}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium capitalize">{serviceName}</CardTitle>
                    {getStatusIcon(service.status)}
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <Badge className={getStatusColor(service.status)}>{service.status}</Badge>
                      {service.responseTime && (
                        <p className="text-xs text-muted-foreground">Response time: {service.responseTime}ms</p>
                      )}
                      {service.error && <p className="text-xs text-chart-3">{service.error}</p>}
                      <p className="text-xs text-muted-foreground">
                        Last checked: {new Date(service.lastChecked).toLocaleTimeString()}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          {healthStatus && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Server className="h-4 w-4 mr-2" />
                    Memory Usage
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Heap Used</span>
                      <span>{formatBytes(healthStatus.metrics.memoryUsage.heapUsed)}</span>
                    </div>
                    <Progress
                      value={
                        (healthStatus.metrics.memoryUsage.heapUsed / healthStatus.metrics.memoryUsage.heapTotal) * 100
                      }
                      className="h-2"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">RSS:</span>
                      <span className="ml-2">{formatBytes(healthStatus.metrics.memoryUsage.rss)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">External:</span>
                      <span className="ml-2">{formatBytes(healthStatus.metrics.memoryUsage.external)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {systemStatus && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Activity className="h-4 w-4 mr-2" />
                      Application Metrics
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Users:</span>
                      <span className="font-medium">{systemStatus.metrics.totalUsers.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Active Workflows:</span>
                      <span className="font-medium">{systemStatus.metrics.activeWorkflows}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Credits Processed:</span>
                      <span className="font-medium">{systemStatus.metrics.creditsProcessed.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">API Calls:</span>
                      <span className="font-medium">{systemStatus.metrics.apiCalls.toLocaleString()}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="integrations" className="space-y-4">
          {systemStatus && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Object.entries(systemStatus.integrations).map(([integration, isConfigured]) => (
                <Card key={integration}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium capitalize">{integration}</CardTitle>
                    {isConfigured ? (
                      <CheckCircle className="h-4 w-4 text-chart-4" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-chart-3" />
                    )}
                  </CardHeader>
                  <CardContent>
                    <Badge className={isConfigured ? "bg-chart-4/20 text-chart-4" : "bg-chart-3/20 text-chart-3"}>
                      {isConfigured ? "Configured" : "Not Configured"}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
