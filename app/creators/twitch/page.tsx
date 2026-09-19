import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ShieldCheck, Twitch } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import TwitchPilotConsole from "./TwitchPilotConsole"

export const metadata: Metadata = {
  title: "AMS Controlled Twitch Pilot",
  description: "Owner-only controls for the controlled AMS Twitch Watcher pilot.",
  robots: { index: false, follow: false },
}

export default function TwitchPilotPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/70 px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Link href="/creators" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />AMS Creators
          </Link>
          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">Controlled integration</Badge>
        </div>
      </header>

      <section className="border-b border-border/70 px-5 py-14 sm:px-8 lg:py-20">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary"><Twitch className="h-4 w-4" />Twitch Watcher pilot</div>
            <h1 className="text-4xl font-black tracking-tight sm:text-6xl">Connect one channel. Prove every event. Automate nothing dangerous.</h1>
            <p className="max-w-3xl text-lg leading-8 text-muted-foreground">
              This operator console is the controlled activation path for AMS Twitch Watcher. The first production proof is deliberately read-only: Twitch authorization, signed stream events, VOD references, creator markers, existing Twitch clips, and a durable metadata-backed stream summary.
            </p>
          </div>
          <Card>
            <CardHeader>
              <ShieldCheck className="mb-2 h-5 w-5 text-primary" />
              <CardTitle>Hard boundaries</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
              <p>No automatic chat messages, moderation, posting, clip creation, deletion, spending, or Twitch account mutation. Owner-approved clip creation is available only after optional clip-management authorization.</p>
              <p>No gameplay-analysis claim unless AMS actually receives media content later.</p>
              <p>No commercial availability until an authorized real channel completes the online → offline → summary acceptance run.</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="px-5 py-14 sm:px-8 lg:py-20">
        <div className="mx-auto max-w-6xl">
          <TwitchPilotConsole />
        </div>
      </section>
    </main>
  )
}
