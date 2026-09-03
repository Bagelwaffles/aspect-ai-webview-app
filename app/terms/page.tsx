import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Terms of Service | Aspect Marketing Solutions",
  description:
    "Terms governing use of Aspect Marketing Solutions software, automation services, marketing audits, subscriptions, and related customer services.",
}

export default function TermsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-bold">Terms of Service</h1>
      <p className="mt-3 text-sm text-muted-foreground">Effective September 3, 2026</p>

      <div className="mt-8 space-y-8 text-sm leading-7 text-muted-foreground">
        <section>
          <h2 className="text-xl font-semibold text-foreground">1. Agreement to these terms</h2>
          <p className="mt-2">
            These Terms of Service govern your access to and use of Aspect Marketing Solutions
            ("AMS") websites, software, AI-assisted tools, automation services, marketing audits,
            subscriptions, and related services. By using a paid or free AMS service, you agree to
            these terms and any service-specific terms shown at checkout or during enrollment.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">2. Services and availability</h2>
          <p className="mt-2">
            AMS provides marketing, automation, research, content, software, and AI-assisted
            services. Features may be released, changed, paused, limited, or retired as the platform
            develops. A feature shown in a roadmap, beta, preview, or development state is not a
            promise of permanent availability or a guaranteed release date.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">3. AI-assisted outputs</h2>
          <p className="mt-2">
            AI-assisted outputs may contain errors, omissions, or unsuitable recommendations. You are
            responsible for reviewing outputs before publishing, sending, relying on, or acting on
            them. AMS does not guarantee that generated material will achieve a particular marketing,
            financial, search, sales, or business result.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">4. Accounts and acceptable use</h2>
          <p className="mt-2">
            You are responsible for activity performed through your account and for keeping your
            authentication credentials secure. You may not use AMS to violate law, infringe rights,
            distribute malicious content, interfere with platform security, abuse service limits, or
            attempt unauthorized access to systems, accounts, or data.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">5. Purchases, subscriptions, and credits</h2>
          <p className="mt-2">
            Prices and included usage are shown on the applicable checkout or pricing page. Unless a
            different term is stated at purchase, subscription charges recur until canceled. Usage
            credits, service allowances, and promotional benefits may be subject to plan-specific
            limits and expiration rules disclosed with the applicable offer.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">6. Refunds and failed fulfillment</h2>
          <p className="mt-2">
            Refund eligibility depends on the purchased service and applicable law. If an automated
            fulfillment attempt fails before the purchased service is delivered, AMS may retry,
            restore applicable usage, provide the service through another supported path, or issue a
            refund when appropriate.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">7. Customer content and permissions</h2>
          <p className="mt-2">
            You retain ownership of content and materials you submit to AMS. You grant AMS the limited
            permission necessary to process those materials to provide, secure, troubleshoot, and
            improve the requested service. You represent that you have the rights and permissions
            needed to provide the materials you submit.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">8. Third-party services</h2>
          <p className="mt-2">
            AMS may connect with third-party platforms, payment processors, publishing services, AI
            providers, or other integrations. Those services may have their own terms and availability,
            and AMS is not responsible for outages, restrictions, or policy changes controlled by a
            third party.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">9. Disclaimers and limitation of liability</h2>
          <p className="mt-2">
            AMS services are provided on an "as available" basis to the extent permitted by law. AMS
            does not guarantee uninterrupted operation, specific rankings, leads, revenue, conversion
            rates, or other business outcomes. To the maximum extent permitted by law, AMS will not be
            liable for indirect, incidental, special, consequential, or punitive damages arising from
            use of the services.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">10. Changes and termination</h2>
          <p className="mt-2">
            AMS may update these terms as services evolve. Material updates will be reflected by a new
            effective date on this page. AMS may suspend or terminate access when reasonably necessary
            to address abuse, security risk, nonpayment, legal requirements, or material violations of
            these terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">11. Contact</h2>
          <p className="mt-2">
            Questions about these terms can be submitted through the AMS contact page.
          </p>
          <Link className="mt-3 inline-block font-medium text-foreground underline" href="/contact">
            Contact Aspect Marketing Solutions
          </Link>
        </section>
      </div>
    </main>
  )
}
