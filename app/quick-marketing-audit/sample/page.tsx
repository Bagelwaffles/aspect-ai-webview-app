import Link from "next/link"
import {
  ArrowRight, BadgeCheck, ChartNoAxesCombined, CheckCircle2, Clock3,
  ExternalLink, FileDown, FileSearch, ListChecks, ShieldCheck, Wrench,
} from "lucide-react"

import { AmsPublicHeader } from "@/components/ams-public-header"
import { AmsPublicFooter } from "@/components/ams-public-footer"

export const metadata = {
  title: "Illustrative Marketing Audit | Aspect Marketing Solutions",
  description: "Explore an explicitly fictional, no-cost example of an evidence-based AMS Marketing Audit.",
}

const findings = [
  {
    id: "01",
    title: "Make the headline specific",
    impact: "High potential clarity improvement",
    effort: "Low effort",
    observation: "This fictional homepage opens with ‘Quality Services’ and does not identify the service area or the buyer's problem.",
    before: "Quality Services",
    after: "Home repairs in your neighborhood. Request a clear quote today.",
    action: "Use a headline that states the service and whom it serves. Only add a service-area claim once verified.",
    evidence: "Illustrative hero headline in fictional mockup — no real website or analytics were inspected.",
  },
  {
    id: "02",
    title: "Make the next step obvious",
    impact: "High potential usability improvement",
    effort: "Low effort",
    observation: "The fictional page has a vague ‘Learn More’ link rather than a clearly identified quote-request action.",
    before: "Learn More",
    after: "Request a Repair Quote",
    action: "Put a descriptive primary CTA in the first screen and verify the form works on phones.",
    evidence: "Illustrative CTA in fictional mockup — no conversion data was measured.",
  },
  {
    id: "03",
    title: "Put trust near the decision",
    impact: "Medium potential clarity improvement",
    effort: "Medium effort",
    observation: "The fictional quote area does not yet show factual proof of credentials, completed work or customer reviews.",
    before: "We're the best!",
    after: "See our verified credentials and recent work before requesting a quote.",
    action: "Add genuine credentials, photos or reviews only when the business has permission and evidence to support them.",
    evidence: "Illustrative trust section only — no review counts or credentials are asserted.",
  },
  {
    id: "04",
    title: "Reduce friction on mobile",
    impact: "Medium potential usability improvement",
    effort: "Medium effort",
    observation: "In the fictional design, the contact link is far below the quote section and difficult to find on a narrow screen.",
    before: "Contact details at the end of the page",
    after: "Persistent, accessible Contact and Request Quote options",
    action: "Improve responsive layout, tap targets and a working contact path before paying for traffic.",
    evidence: "Fictional mobile wireframe — not a device test of a customer website.",
  },
  {
    id: "05",
    title: "Measure the actual next step",
    impact: "Important measurement foundation",
    effort: "Medium effort",
    observation: "The mock business has not supplied any qualified-inquiry or form-submit analytics.",
    before: "Success = more website visits",
    after: "Weekly qualified inquiries, quote requests and response time",
    action: "Define one first-party conversion event; set up analytics only with authorization, then compare a real baseline.",
    evidence: "Example missing-data scenario — actual traffic and conversion rate are unknown.",
  },
] as const

const plan = [
  ["1", "Confirm services, audience, locations and claims"],
  ["2", "Rewrite the hero headline and primary CTA"],
  ["3", "Add genuine proof and clarify the offer"],
  ["4", "Test mobile contact and quote-request paths"],
  ["5", "Document privacy-safe measurement requirements"],
  ["6", "Review incoming inquiries and any observed friction"],
  ["7", "Publish a seven-day summary with knowns and unknowns"],
] as const

export default function QuickAuditSamplePage() {
  return (
    <>
      <AmsPublicHeader />
      <main className="ams-public-page min-h-screen bg-background px-4 py-10 sm:px-6 lg:py-16">
        <div className="mx-auto max-w-6xl space-y-9">
          <section className="overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/15 via-background to-background p-5 sm:p-9">
            <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-primary/40 bg-background/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
              <ShieldCheck aria-hidden="true" className="h-4 w-4" />
              Fictional demonstration — not a customer case study
            </div>
            <div className="mt-6 grid gap-7 lg:grid-cols-[1.4fr_0.6fr] lg:items-end">
              <div>
                <p className="mb-3 text-sm font-medium uppercase tracking-widest text-muted-foreground">Aspect Marketing Solutions · Sample Report</p>
                <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">Your marketing audit. Your way.</h1>
                <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
                  Explore how a high-quality AMS audit should connect observations to specific improvements.
                  All findings below use an invented business and sample copy—no live performance has been measured.
                </p>
              </div>
              <div className="rounded-2xl border bg-background/80 p-5 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Example client</p>
                <p className="mt-2 text-xl font-semibold">Maple Street Home Repair</p>
                <p className="mt-1 text-sm text-muted-foreground">Fictional local home-services business</p>
                <div className="mt-4 flex items-center gap-2 text-sm"><BadgeCheck className="h-4 w-4 text-primary" /> Five sample recommendations</div>
                <div className="mt-2 flex items-center gap-2 text-sm"><Clock3 className="h-4 w-4 text-primary" /> Seven-day action plan</div>
              </div>
            </div>
            <nav aria-label="Sample report sections" className="mt-7 flex flex-wrap gap-2 text-sm">
              <a className="rounded-lg border bg-background/80 px-3 py-2 hover:border-primary" href="#sample-findings">See the findings</a>
              <a className="rounded-lg border bg-background/80 px-3 py-2 hover:border-primary" href="#sample-visuals">See the graphics</a>
              <a className="rounded-lg border bg-background/80 px-3 py-2 hover:border-primary" href="#sample-plan">Seven-day plan</a>
              <a className="rounded-lg border bg-background/80 px-3 py-2 hover:border-primary" href="#sample-implementation">Implementation options</a>
            </nav>
          </section>

          <section aria-labelledby="sample-method" className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border p-5"><FileSearch className="mb-3 h-6 w-6 text-primary" /><h2 id="sample-method" className="font-semibold">Show the evidence</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Real paid reports should show the inspected page, date, supporting link and confidence—not fabricated analytics.</p></div>
            <div className="rounded-2xl border p-5"><Wrench className="mb-3 h-6 w-6 text-primary" /><h2 className="font-semibold">Show what to change</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">For every finding: the why, the suggested fix, before/after copy and an achievable first action.</p></div>
            <div className="rounded-2xl border p-5"><ListChecks className="mb-3 h-6 w-6 text-primary" /><h2 className="font-semibold">Make it usable</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">A practical seven-day plan with the option to request a separate implementation quote.</p></div>
          </section>

          <section aria-labelledby="sample-visual-heading" id="sample-visuals" className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border p-5 sm:p-7">
              <h2 id="sample-visual-heading" className="text-xl font-bold">A visual before-and-after explanation</h2>
              <p className="mt-2 text-sm text-muted-foreground">Wireframes illustrating copy and CTA placement—not screenshots of a real website.</p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-dashed border-orange-400/50 bg-orange-500/5 p-4">
                  <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Before · Fictional</p>
                  <div className="rounded-lg border bg-background p-4">
                    <div className="mb-4 h-2 w-20 rounded bg-muted-foreground/20" aria-hidden="true" />
                    <p className="font-bold">Quality Services</p>
                    <p className="mt-2 text-xs text-muted-foreground">We do great work for everyone.</p>
                    <div className="mt-5 inline-block rounded-md border px-2 py-1 text-xs">Learn More</div>
                  </div>
                </div>
                <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
                  <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">After · Example</p>
                  <div className="rounded-lg border bg-background p-4">
                    <div className="mb-4 h-2 w-20 rounded bg-primary/30" aria-hidden="true" />
                    <p className="font-bold">Home repairs in your neighborhood</p>
                    <p className="mt-2 text-xs text-muted-foreground">Get a clear quote for your next repair.</p>
                    <span className="mt-4 inline-block rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Request a Repair Quote</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border p-5 sm:p-7">
              <div className="flex items-center gap-2"><ChartNoAxesCombined className="h-5 w-5 text-primary" /><h2 className="text-xl font-bold">Prioritize the work—not imaginary ROI</h2></div>
              <p className="mt-2 text-sm text-muted-foreground">Qualitative decision aid. The bars represent illustrative work categories, not measured traffic, rankings, or conversion rates.</p>
              <div className="mt-5 space-y-5">
                {[
                  { label: "Headline and value proposition", width: "w-full", effort: "Low effort · First" },
                  { label: "Primary call to action", width: "w-4/5", effort: "Low effort · First" },
                  { label: "Customer trust proof", width: "w-3/5", effort: "Medium effort" },
                  { label: "Mobile contact path", width: "w-3/5", effort: "Medium effort" },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="mb-2 flex items-start justify-between gap-3 text-sm"><span className="font-medium">{item.label}</span><span className="text-xs text-muted-foreground">{item.effort}</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className={`h-full rounded-full bg-primary ${item.width}`} /></div>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-xs text-muted-foreground">No numerical score is assigned. Actual prioritization depends on verified evidence and business goals.</p>
            </div>
          </section>

          <section id="sample-findings" aria-labelledby="sample-findings-heading">
            <div className="mb-5"><p className="text-sm font-medium uppercase tracking-widest text-primary">Practical audit findings</p><h2 id="sample-findings-heading" className="mt-1 text-2xl font-bold sm:text-3xl">Five findings. Five clear fixes.</h2><p className="mt-2 text-sm text-muted-foreground">All five examples below are fictional and illustrate what a real evidence-rich report will provide.</p></div>
            <div className="grid gap-4 lg:grid-cols-2">
              {findings.map((finding) => (
                <article key={finding.id} className="rounded-2xl border p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold uppercase tracking-widest text-primary">Finding {finding.id}</span><span className="rounded-full bg-muted px-3 py-1 text-xs">{finding.effort}</span></div>
                  <h3 className="mt-3 text-xl font-semibold">{finding.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{finding.observation}</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border bg-muted/40 p-3"><span className="text-xs font-medium uppercase text-muted-foreground">Before</span><p className="mt-1 text-sm">{finding.before}</p></div>
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3"><span className="text-xs font-medium uppercase text-primary">Example improvement</span><p className="mt-1 text-sm">{finding.after}</p></div>
                  </div>
                  <p className="mt-4 text-sm"><strong>What AMS recommends:</strong> {finding.action}</p>
                  <p className="mt-2 text-xs text-muted-foreground"><strong>Illustrative evidence:</strong> {finding.evidence}</p>
                  <p className="mt-2 text-xs text-muted-foreground"><strong>Priority note:</strong> {finding.impact}; not a measured performance claim.</p>
                </article>
              ))}
            </div>
          </section>

          <section id="sample-plan" className="rounded-2xl border p-5 sm:p-8">
            <div className="flex items-center gap-2"><ListChecks className="h-6 w-6 text-primary" /><h2 className="text-2xl font-bold">An achievable seven-day plan</h2></div>
            <ol className="mt-5 grid gap-3 sm:grid-cols-2">
              {plan.map(([day, task]) => <li className="flex items-start gap-3 rounded-lg border p-3" key={day}><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-semibold text-primary">{day}</span><div><span className="block text-xs uppercase text-muted-foreground">Day {day}</span><span className="text-sm">{task}</span></div></li>)}
            </ol>
          </section>

          <section id="sample-implementation" className="rounded-2xl border border-primary/30 bg-primary/5 p-5 sm:p-8">
            <h2 className="text-2xl font-bold">You have the plan. Want help implementing it?</h2>
            <p className="mt-3 max-w-3xl text-muted-foreground">A future paid report can let customers select one or more verified findings to request a separate, no-obligation implementation quote. Submitting a request will never trigger a charge or modify a customer's website. This demonstration has no live implementation checkout.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {["Quick Fix · quoted per task", "Growth Sprint · quoted scope", "Full Implementation · quoted scope"].map((offer) => <div className="rounded-xl border bg-background p-4 text-sm font-semibold" key={offer}><CheckCircle2 className="mb-3 h-5 w-5 text-primary" />{offer}</div>)}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/quick-marketing-audit" className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90">View current audit offer <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/contact" className="inline-flex items-center gap-2 rounded-lg border bg-background px-5 py-3 text-sm font-semibold hover:border-primary">Contact AMS <ExternalLink className="h-4 w-4" /></Link>
            </div>
          </section>
          <section className="rounded-xl border p-5">
            <div className="flex items-start gap-2"><FileDown className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><h2 className="font-semibold">About audit delivery formats</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">This page is an online demonstration. The existing paid audit supports a browser-visible result, HTML download and print/save-as-PDF. Fully branded PDF export, slide decks, personalized video narration and customer choice at checkout are planned upgrades, not currently verified live features.</p></div></div>
          </section>
          <footer className="text-xs text-muted-foreground">Methodology example only. No fictional business, customer, testimonial, performance, or external account has been used or measured.</footer>
        </div>
      </main>
      <AmsPublicFooter />
    </>
  )
}
