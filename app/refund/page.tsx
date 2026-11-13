import { AmsPublicHeader } from "@/components/ams-public-header"
import { AmsPublicFooter } from "@/components/ams-public-footer"
import Link from "next/link"

export default function RefundPage() {
  return (
    <div className="ams-public-page">
      <AmsPublicHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto min-h-screen max-w-3xl px-6 py-10">
        <h1 className="text-3xl font-bold">Refund Policy</h1>
        <p className="mt-4 text-muted-foreground">
          A complete customer-facing refund policy is still being finalized. This page is not a complete
          published billing policy and does not establish product-specific refund eligibility or timeframes.
        </p>
        <section className="mt-8 space-y-3 text-sm leading-7 text-muted-foreground">
          <h2 className="text-xl font-semibold text-foreground">Current published terms</h2>
          <p>
            Section 6 of the <Link className="underline" href="/terms#refunds">Terms of Service</Link> states
            that refund eligibility depends on the purchased service and applicable law. It also describes
            possible responses when automated fulfillment fails before delivery. It does not promise an
            automatic refund or define a universal refund window.
          </p>
          <p>
            The internal Quick Marketing Audit fulfillment guidance instructs AMS to stop work if payment is
            refunded before fulfillment begins, and to pause fulfillment if a dispute appears. That operational
            guidance is not a complete customer refund policy.
          </p>
          <p>
            For a question about an existing payment or service request, use the
            {" "}<Link className="underline" href="/contact">AMS contact page</Link>.
          </p>
        </section>
      </main>
      <AmsPublicFooter />
    </div>
  )
}
