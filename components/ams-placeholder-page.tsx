"use client"

import Link from "next/link"
import { ArrowLeft, CircleAlert, Clock3 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

type PlaceholderPageProps = {
  title: string
  description: string
  status?: string
  bullets?: string[]
  primaryActionLabel?: string
  primaryActionHref?: string
  secondaryActionLabel?: string
  secondaryActionHref?: string
}

export function PlaceholderPage({
  title,
  description,
  status = "In progress",
  bullets = [],
  primaryActionLabel = "Back to dashboard",
  primaryActionHref = "/",
  secondaryActionLabel,
  secondaryActionHref,
}: PlaceholderPageProps) {
  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <Clock3 className="h-3 w-3" />
                {status}
              </Badge>
            </div>
            <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{title}</h1>
            <p className="max-w-prose text-sm text-muted-foreground sm:text-base">{description}</p>
          </div>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href={primaryActionHref}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {primaryActionLabel}
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
              <CircleAlert className="h-5 w-5 text-muted-foreground" />
              Current state
            </CardTitle>
            <CardDescription>This page is available, but the feature is still being finished safely.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {bullets.length > 0 ? (
              <ul className="space-y-2 text-sm text-muted-foreground">
                {bullets.map((bullet) => (
                  <li key={bullet} className="rounded-lg border bg-muted/20 px-3 py-2 leading-relaxed">
                    {bullet}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                There are no launch-blocking errors here. This page is intentionally honest about its current state.
              </p>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              {secondaryActionLabel && secondaryActionHref ? (
                <Button asChild variant="outline" className="w-full sm:w-auto">
                  <Link href={secondaryActionHref}>{secondaryActionLabel}</Link>
                </Button>
              ) : null}
              <Button asChild className="w-full sm:w-auto">
                <Link href={primaryActionHref}>{primaryActionLabel}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
