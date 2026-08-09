export const metadata = {
  title: "Privacy Policy | Aspect Marketing Solutions",
  description: "Privacy policy for Aspect Marketing Solutions web services and the AMS Android companion app.",
}

const updated = "August 9, 2026"

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-background px-5 py-12 sm:px-8 lg:py-16">
      <article className="mx-auto max-w-4xl space-y-8 text-foreground">
        <header className="space-y-3 border-b border-border pb-8">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">Aspect Marketing Solutions</p>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">Last updated: {updated}</p>
          <p className="max-w-3xl leading-7 text-muted-foreground">
            This policy explains how Aspect Marketing Solutions (&quot;AMS&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) handles information in connection with our website, services, and the Aspect Marketing Solutions Android companion app.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">1. Information the Android app handles</h2>
          <p className="leading-7 text-muted-foreground">
            The current Google Play build is a consumption-only companion. It does not create accounts, accept payments, sell subscriptions, display ads, access precise location, contacts, photos, camera, microphone, SMS, call logs, or installed-app inventory.
          </p>
          <p className="leading-7 text-muted-foreground">
            The app makes an encrypted HTTPS request to the AMS public health endpoint so it can display current platform status. Like most internet services, our hosting and security providers may process standard connection information such as IP address, request time, browser/app user-agent, and diagnostic logs needed to deliver and protect the service.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">2. Information handled by AMS web services</h2>
          <p className="leading-7 text-muted-foreground">Depending on the feature you choose to use, AMS may process:</p>
          <ul className="list-disc space-y-2 pl-6 leading-7 text-muted-foreground">
            <li>Account information such as your name, email address, and authentication identifiers when you sign in.</li>
            <li>Business and service information you submit, such as your company name, website or social profile, target customer, marketing challenge, requests, and other details needed to provide a requested service.</li>
            <li>Transaction and subscription metadata such as product, price, payment status, customer identifier, and receipt information. Payment card details are entered into and processed by Stripe; AMS does not need to store full card numbers.</li>
            <li>Operational and security information such as request logs, timestamps, service status, fraud/abuse signals, and technical diagnostics.</li>
            <li>Content you intentionally submit to an AMS workflow or agent when that capability is available.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">3. Why we use information</h2>
          <ul className="list-disc space-y-2 pl-6 leading-7 text-muted-foreground">
            <li>Provide, secure, troubleshoot, and improve AMS services.</li>
            <li>Authenticate users and protect restricted areas.</li>
            <li>Fulfill service requests and maintain service history.</li>
            <li>Process payments, subscriptions, refunds, and entitlement records when a web purchase is made.</li>
            <li>Communicate about requested services, account activity, support, and important operational notices.</li>
            <li>Prevent fraud, abuse, unauthorized access, and other security incidents.</li>
            <li>Meet legal, tax, accounting, and regulatory obligations that apply to AMS.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">4. Service providers and sharing</h2>
          <p className="leading-7 text-muted-foreground">
            AMS uses service providers to operate the platform. Depending on the feature, these may include Google for authentication, Stripe for payments, Vercel for web hosting and application delivery, Upstash for Redis-based persistence, and n8n for approved automation workflows. These providers process information for the services they provide to AMS and are subject to their own contractual and privacy obligations.
          </p>
          <p className="leading-7 text-muted-foreground">
            AMS does not sell personal or sensitive user data. We may disclose information when required by law, to protect users or AMS from fraud or security threats, or as part of a legitimate business transfer subject to applicable law.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">5. Security</h2>
          <p className="leading-7 text-muted-foreground">
            We use HTTPS in transit, server-side secret storage, authenticated access controls, and operational safeguards designed to limit unauthorized access. No internet service can guarantee absolute security, so AMS also uses monitoring, rate limits, and incident-response practices where appropriate.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">6. Retention and deletion</h2>
          <p className="leading-7 text-muted-foreground">
            AMS keeps information only as long as reasonably needed for the purpose it was collected, to operate and secure the service, and to meet legal, tax, accounting, dispute, or fraud-prevention requirements. Retention periods can differ by data type and service.
          </p>
          <p className="leading-7 text-muted-foreground">
            You may request access, correction, or deletion of personal information by contacting AMS at the email below. We will verify the request as appropriate and delete or de-identify eligible data, except information we must retain for lawful reasons. The current Android companion does not create a separate Android account.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">7. Children</h2>
          <p className="leading-7 text-muted-foreground">
            AMS business software and services are not directed to children under 13. We do not knowingly design the Android companion to collect personal information from children.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">8. Changes to this policy</h2>
          <p className="leading-7 text-muted-foreground">
            We may update this policy as AMS features, providers, or legal requirements change. We will update the date at the top of this page when the policy changes materially.
          </p>
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-card p-6">
          <h2 className="text-2xl font-bold">9. Privacy contact</h2>
          <p className="leading-7 text-muted-foreground">
            Aspect Marketing Solutions<br />
            Privacy and support contact: <a className="text-primary underline underline-offset-4" href="mailto:kimberleyaversbiz@gmail.com">kimberleyaversbiz@gmail.com</a>
          </p>
        </section>
      </article>
    </main>
  )
}
