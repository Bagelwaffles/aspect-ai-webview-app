import { AmsPublicHeader } from "@/components/ams-public-header"
import { AmsPublicFooter } from "@/components/ams-public-footer"
import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import { CreatorPilotForm } from "./creator-pilot-form"

export const metadata: Metadata = {
  title: "AMS Creator Pilot Application",
  description:
    "Apply for the controlled AMS Creator Pilot for streaming, gaming, clip strategy, creator operations, and channel-growth workflows.",
  robots: {
    index: false,
    follow: true,
  },
  alternates: {
    canonical: "https://www.aspectmarketingsolutions.app/creators/pilot",
  },
}

const boundaries = [
  "No paid subscription is created by this application.",
  "No channel publishing, messaging, spending, or account changes are authorized.",
  "Connected-platform automation stays behind explicit approval and verification gates.",
  "Pilot data is collected only to evaluate and operate the creator pilot.",
]

export default function CreatorPilotPage() {
  return (
    <>
      <AmsPublicHeader />
      <main className="ams-public-page ams-public-page min-h-screen bg-background text-foreground">
      

      <section className="border-b border-border/70 px-5 py-14 sm:px-8 lg:py-20">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
          <div className="space-y-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Creator Pilot</p>
            <h1 className="text-4xl font-black tracking-tight sm:text-6xl">Help us build the creator platform around real streaming work.</h1>
            <p className="max-w-3xl text-lg leading-8 text-muted-foreground">
              Tell AMS where your creator workflow breaks down today. The pilot is focused on stream planning, clip selection, content packaging, analytics, creator safety, community formats, gaming intelligence, and the operational tools needed to grow a channel without turning it into a second full-time admin job.
            </p>
          </div>

          <Card className="border-primary/25 bg-primary/5">
            <CardHeader>
              <ShieldCheck className="h-5 w-5 text-primary" />
              <CardTitle>Approval-first by design</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {boundaries.map((boundary) => (
                <div className="flex gap-3 text-sm leading-6 text-muted-foreground" key={boundary}>
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" />
                  <span>{boundary}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="px-5 py-14 sm:px-8 lg:py-20">
        <div className="mx-auto max-w-5xl">
          <Card>
            <CardHeader>
              <CardTitle className="text-3xl">Creator profile + pilot needs</CardTitle>
            </CardHeader>
            <CardContent>
              <CreatorPilotForm />
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
      <AmsPublicFooter />
    </>
  )
}
