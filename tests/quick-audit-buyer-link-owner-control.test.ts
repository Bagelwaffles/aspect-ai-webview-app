import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const control = readFileSync(
  new URL("../app/owner/resend-preview/buyer-link-dispatch-controls.tsx", import.meta.url),
  "utf8",
)
const page = readFileSync(
  new URL("../app/owner/resend-preview/page.tsx", import.meta.url),
  "utf8",
)
const route = readFileSync(
  new URL("../app/api/internal/quick-audit-pilot-buyer-link-dispatch/route.ts", import.meta.url),
  "utf8",
)
const originalControl = readFileSync(
  new URL("../app/owner/resend-preview/manual-resend-dispatch-controls.tsx", import.meta.url),
  "utf8",
)

test("owner page mounts the separate buyer-link control only within the existing owner-authenticated UI", () => {
  assert.match(page, /import \{ BuyerLinkDispatchControls \} from "\.\/buyer-link-dispatch-controls"/)
  const allowed = page.indexOf("{authorized ? (")
  const mounted = page.indexOf("<BuyerLinkDispatchControls />")
  const denied = page.indexOf("Owner session required")
  assert.ok(allowed >= 0 && mounted > allowed && denied > mounted)
  assert.match(page, /<ManualResendDispatchControls \/>/)
})

test("buyer-link control sends only an owner-confirmed POST to the existing dedicated endpoint", () => {
  assert.match(control, /const ENDPOINT = "\/api\/internal\/quick-audit-pilot-buyer-link-dispatch"/)
  assert.match(control, /if \(submittedRef\.current \|\| busy \|\| !confirmed \|\| !REQUEST_ID\.test\(exact\)\) return/)
  assert.match(control, /submittedRef\.current = true[\s\S]*?await fetch\(ENDPOINT, \{/)
  assert.match(control, /method: "POST"/)
  assert.match(control, /credentials: "same-origin"/)
  assert.match(control, /redirect: "error"/)
  assert.match(control, /cache: "no-store"/)
  assert.match(control, /referrerPolicy: "no-referrer"/)
  assert.match(control, /body: JSON\.stringify\(\{ requestId: exact \}\)/)
  assert.match(control, /disabled=\{!canSubmit\}/)
  assert.doesNotMatch(control, /fetch\("\/api\/internal\/quick-audit-pilot-dispatch"/)
  assert.match(originalControl, /fetch\("\/api\/internal\/quick-audit-pilot-dispatch"/)
})

test("buyer-link UI never claims inbox delivery or automatically retries uncertain outcomes", () => {
  assert.match(control, /response\.status === 200 && body\?\.ok === true && code === "PILOT_BUYER_LINK_SUBMITTED"/)
  assert.match(control, /Inbox delivery and signed report access are NOT yet proven/)
  assert.match(control, /outcome UNKNOWN/)
  assert.match(control, /Do not retry/)
  assert.doesNotMatch(control, /setTimeout|setInterval|window\.location|location\.reload|localStorage/)
})

test("buyer-link endpoint keeps independent server-side owner, scope and TEST payment guards", () => {
  assert.match(route, /authorizeOwnerApiRequest\(request, \{ requireTrustedOrigin: true \}\)/)
  assert.match(route, /env\.AMS_QUICK_AUDIT_BUYER_DISPATCH_ENABLED !== "true"/)
  assert.match(route, /env\.AMS_QUICK_AUDIT_PILOT_BUYER_RESULT_ENABLED !== "true"/)
  assert.match(route, /env\.AMS_STRIPE_PILOT_TEST_SECRET_KEY\?\.startsWith\("sk_test_"\)/)
  assert.match(route, /stores\.buyerLinkOutbox/)
  assert.match(route, /originalOutbox: stores\.outbox/)
  assert.match(route, /"PILOT_BUYER_LINK_POST_ONLY"/)
  assert.doesNotMatch(control, /createCheckout|Stripe\(|setProjectEnv|armDispatch/)
})
