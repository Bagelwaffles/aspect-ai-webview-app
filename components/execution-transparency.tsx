"use client"

import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import type { ExecutionProvenance } from "@/lib/execution-transparency"

export type { ExecutionProvenance }

export function ExternalAiProcessingConsent({
  checked,
  onCheckedChange,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onCheckedChange(event.target.checked)}
          className="mt-1 h-4 w-4"
        />
        <span>
          I approve sending this brief and relevant saved workspace context to the external AI model provider routed through Vercel AI Gateway for this generation.
        </span>
      </label>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        This run is AI-generated and automatically checked for required structure and safe persistence.
        It is not human-reviewed. Any future human review requires separate explicit consent and must
        be recorded. See the <Link href="/privacy" className="underline underline-offset-2">Privacy Policy</Link>.
      </p>
    </div>
  )
}

export function ExecutionProvenancePanel({
  provenance,
}: {
  provenance: ExecutionProvenance | null | undefined
}) {
  if (!provenance) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Execution transparency
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Execution provenance is unavailable for this legacy run.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
        Execution transparency
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {provenance.aiGenerated ? <Badge variant="outline">AI-generated</Badge> : null}
        {provenance.automaticallyVerified ? (
          <Badge variant="outline">Automatically verified</Badge>
        ) : null}
        <Badge variant="outline">
          {provenance.humanReviewed ? "Human-reviewed" : "No human review"}
        </Badge>
        {provenance.externalProviders.length ? (
          <Badge variant="outline">External provider</Badge>
        ) : null}
      </div>
      <div className="mt-3 space-y-1 text-xs leading-5 text-muted-foreground">
        {provenance.externalProviders.length ? (
          <p>
            Processing provider: {provenance.externalProviders.join(", ")}. Customer consent was
            recorded for this run.
          </p>
        ) : (
          <p>No external provider was recorded for this run.</p>
        )}
        <p>
          “Automatically verified” means AMS validated the required output structure and protected
          persistence path; it does not mean every factual claim was independently fact-checked.
        </p>
      </div>
    </div>
  )
}
