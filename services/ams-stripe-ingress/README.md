# AMS isolated Stripe ingress (sandbox only)
This is NOT the AMS application. It serves only /api/stripe-webhook, never fulfills payments or sends email.
No production Stripe events accepted. All intake settings default OFF. Preview requires a fresh <=10min cutoff.
Source deliberately has no owner UI, static assets, internal application routes or Stripe API keys.
The receipt is written to the existing isolated AMS Stripe audit pilot Upstash database and a separate namespace.
It always returns HTTP 503 after durable storage, so no paid fulfillment is falsely acknowledged.
DO NOT route live Stripe traffic here or disable deployment protection until isolated external ingress is verified.
No keys or tokens belong in Git. Do not link a production/live domain.
