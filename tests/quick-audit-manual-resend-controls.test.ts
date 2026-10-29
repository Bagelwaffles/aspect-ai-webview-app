import { test } from "node:test"
import assert from "node:assert/strict"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { ManualResendDispatchControls } from "../app/owner/resend-preview/manual-resend-dispatch-controls"

test("manual owner resend controls render inert and require explicit approval", () => {
  const html = renderToStaticMarkup(createElement(ManualResendDispatchControls))
  assert.match(html, /Manual owner-only Resend TEST delivery/)
  assert.match(html, /Existing queued Quick Audit request ID/)
  assert.match(html, /type="checkbox"/)
  assert.match(html, /<button[^>]*disabled=""/)
  assert.match(html, /Submit ONE owner-only TEST email/)
  assert.doesNotMatch(html, /kimberleyaversbiz@gmail.com|whsec_|sk_test_|resend\.com\/emails/)
})
