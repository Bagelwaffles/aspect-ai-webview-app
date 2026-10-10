import { AmsPublicHeader } from "@/components/ams-public-header"
import { AmsPublicFooter } from "@/components/ams-public-footer"
export const metadata = {
  title: "Privacy Policy | Aspect Marketing Solutions",
  description: "Privacy policy for Aspect Marketing Solutions web services and the AMS Android companion app.",
}

const updated = "October 9, 2026"

export default function PrivacyPolicyPage() {
  return (
    <>
      <AmsPublicHeader />
      <main className="ams-public-page ams-public-page min-h-screen bg-background px-5 py-12 sm:px-8 lg:py-16">
      <article className="mx-auto max-w-4xl space-y-8 text-foreground">
        <header className="space-y-3 border-b border-border pb-8">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">Aspect Marketing Solutions</p>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">Last updated: {updated}</p>
          <p className="max-w-3xl leading-7 text-muted-foreground">
            This policy explains how Aspect Marketing Solutions (&quot;AMS&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) handles information in connection with our website, services, Android beta testing program, and the Aspect Marketing Solutions Android companion app.
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
            <li>Android beta tester information such as first name, Google account email used for Play testing, Android device description, referral source, optional notes, 14-day testing commitment, and private beta feedback you submit.</li>
            <li>Transaction and subscription metadata such as product, price, payment status, customer identifier, and receipt information. Payment card details are entered into and processed by Stripe; AMS does not need to store full card numbers.</li>
            <li>Operational and security information such as request logs, timestamps, service status, fraud/abuse signals, and technical diagnostics.</li>
            <li>Content you intentionally submit to an AMS workflow or agent. When you request an AI-generated deliverable, the relevant submitted content and instructions may be sent through our AI gateway to the model provider needed to generate that requested output.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">3. Why we use information</h2>
          <ul className="list-disc space-y-2 pl-6 leading-7 text-muted-foreground">
            <li>Provide, secure, troubleshoot, and improve AMS services.</li>
            <li>Authenticate users and protect restricted areas.</li>
            <li>Generate the drafts, reports, plans, and other deliverables you explicitly request from AMS agents.</li>
            <li>Coordinate the Android closed beta, maintain the private tester roster, review tester feedback, and document legitimate testing outcomes for Google Play production-readiness review.</li>
            <li>Fulfill service requests and maintain service history.</li>
            <li>Process payments, subscriptions, refunds, and entitlement records when a web purchase is made.</li>
            <li>Communicate about requested services, account activity, support, testing invitations, and important operational notices.</li>
            <li>Prevent fraud, abuse, unauthorized access, and other security incidents.</li>
            <li>Meet legal, tax, accounting, and regulatory obligations that apply to AMS.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">4. Service providers and sharing</h2>
          <p className="leading-7 text-muted-foreground">
            AMS uses service providers to operate the platform. Depending on the feature, these may include Google for authentication and Google Play testing/distribution, Stripe for payments, Vercel for web hosting, application delivery, and AI-gateway routing, model providers used to generate customer-requested AI deliverables, Upstash for Redis-based persistence, and n8n for approved automation workflows when that optional integration is enabled. These providers process information for the services they provide to AMS and are subject to their own contractual and privacy obligations.
          </p>
          <p className="leading-7 text-muted-foreground">
            AMS does not sell personal or sensitive user data. We may disclose information when required by law, to protect users or AMS from fraud or security threats, or as part of a legitimate business transfer subject to applicable law.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">5. Google Gmail data</h2>
          <p className="leading-7 text-muted-foreground">
            When the AMS owner explicitly connects a Gmail account, AMS uses the Google Gmail API to monitor that account for narrowly defined business, account, payment, security, and Google Play messages. AMS requests read-only Gmail access for monitoring. The designated primary owner account may also grant Gmail send access for owner alerts and separately enabled, owner-controlled acknowledgements. AMS does not use Gmail access for advertising, marketing campaigns, unsolicited mail, credit decisions, or training generalized artificial-intelligence models.
          </p>
          <p className="leading-7 text-muted-foreground">
            Monitoring reads message identifiers and limited metadata needed to classify relevant messages, such as sender, recipient, subject, timestamps, and delivery-related headers. It does not retrieve attachments and is not designed to store message bodies. AMS stores encrypted OAuth credentials, connection status, bounded monitoring checkpoints, privacy-preserving message fingerprints used for deduplication, and limited alert metadata needed to provide and secure the owner-requested monitoring feature. OAuth credentials are not exposed to browsers, logs, or customers.
          </p>
          <p className="leading-7 text-muted-foreground">
            Gmail-derived data is used only to provide, maintain, secure, and improve the connected owner-facing Gmail features that are visible in AMS. AMS does not sell Google user data. AMS does not transfer Google user data except to infrastructure providers acting on our behalf as necessary to provide or secure those features, when the user gives affirmative consent, or when required by law. Human access is limited to security, support, or troubleshooting needs and only when permitted by the user or required for security or legal reasons.
          </p>
          <p className="leading-7 text-muted-foreground">
            Encrypted Gmail connection credentials are retained while the owner keeps the feature connected or until they are replaced or deleted after a verified request. Temporary OAuth authorization attempts expire after 10 minutes, Preview refresh-verification evidence expires after 30 days, task execution history is limited to 60 records per task, and privacy-preserving deduplication fingerprints are limited to 2,000 per task. The owner may revoke AMS access through the Google Account permissions page and may request manual deletion of eligible stored OAuth credentials and Gmail-derived monitoring data through the privacy contact below. AMS verifies deletion requests before acting and confirms completion, except for minimal records that must be retained for security, fraud prevention, or legal compliance. AMS does not currently provide an in-product Gmail disconnect or deletion control, and revoking access at Google does not by itself delete records already retained by AMS.
          </p>
          <p className="leading-7 text-muted-foreground">
            AMS&apos;s use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">6. AI execution transparency and consent</h2>
          <p className="leading-7 text-muted-foreground">
            AMS distinguishes AI-generated work, automatic validation, human review, and external-provider processing. The protected generation workflows require affirmative customer consent before customer-provided content or relevant saved workspace context is sent to an external AI model provider.
          </p>
          <p className="leading-7 text-muted-foreground">
            Successful protected generation runs record execution provenance, including whether the result was AI-generated, whether required output structure and persistence were automatically validated, whether a human reviewed the work, which external processing provider was used, and the recorded consent state. A human review or other new external handoff requires the applicable consent before that handling occurs.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">7. Security</h2>
          <p className="leading-7 text-muted-foreground">
            We use HTTPS in transit, server-side secret storage, authenticated access controls, and operational safeguards designed to limit unauthorized access. The Android tester roster is available only on an internal operator surface. No internet service can guarantee absolute security, so AMS also uses monitoring, rate limits, and incident-response practices where appropriate.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">8. Retention and deletion</h2>
          <p className="leading-7 text-muted-foreground">
            AMS keeps information only as long as reasonably needed for the purpose it was collected, to operate and secure the service, and to meet legal, tax, accounting, dispute, or fraud-prevention requirements. The current Android beta roster and private feedback records are configured with a maximum 120-day application retention window unless a shorter deletion request or longer lawful retention requirement applies.
          </p>
          <p className="leading-7 text-muted-foreground">
            You may request access, correction, or deletion of personal information by contacting AMS at the email below. We will verify the request as appropriate and delete or de-identify eligible data, except information we must retain for lawful reasons. The current Android companion does not create a separate Android account.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">9. Children</h2>
          <p className="leading-7 text-muted-foreground">
            AMS business software and services are not directed to children under 13. We do not knowingly design the Android companion or beta recruitment program to collect personal information from children.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">10. Changes to this policy</h2>
          <p className="leading-7 text-muted-foreground">
            We may update this policy as AMS features, providers, or legal requirements change. We will update the date at the top of this page when the policy changes materially.
          </p>
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-card p-6">
          <h2 className="text-2xl font-bold">11. Privacy contact</h2>
          <p className="leading-7 text-muted-foreground">
            Aspect Marketing Solutions<br />
            Privacy and support contact: <a className="text-primary underline underline-offset-4" href="mailto:kimberleyaversbiz@gmail.com">kimberleyaversbiz@gmail.com</a>
          </p>
        </section>
      </article>
    </main>
      <AmsPublicFooter />
    </>
  )
}
