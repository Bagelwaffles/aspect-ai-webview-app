import assert from "node:assert/strict"
import test from "node:test"

import {
  artifactFilename,
  buildBrandedHtmlArtifact,
  escapeArtifactHtml,
} from "../lib/client-artifacts"
import { splitProductArtifactBody } from "../lib/product-artifacts"

test("artifact builder escapes customer-controlled HTML", () => {
  assert.equal(escapeArtifactHtml(`<script>alert("x")</script>`), "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;")

  const html = buildBrandedHtmlArtifact({
    title: "<img src=x onerror=alert(1)>",
    sections: [{ heading: "Result", text: "<script>bad()</script>" }],
  })

  assert.doesNotMatch(html, /<script>bad\(\)<\/script>/)
  assert.match(html, /&lt;script&gt;bad\(\)&lt;\/script&gt;/)
})

test("artifact filenames are portable and bounded", () => {
  const filename = artifactFilename("My Great Product! 2026", "customer-product")
  assert.equal(filename, "my-great-product-2026-customer-product.html")
})

test("Product Creator separates customer deliverable from seller launch kit", () => {
  const parts = splitProductArtifactBody(
    "CUSTOMER DELIVERABLE\nA usable workbook.\n\nSELLER LAUNCH KIT\nListing copy and launch checklist.",
    "digital-download",
  )

  assert.equal(parts.deliverableHeading, "Customer Deliverable")
  assert.equal(parts.deliverableBody, "A usable workbook.")
  assert.equal(parts.sellerLaunchKit, "Listing copy and launch checklist.")
  assert.equal(parts.physicalProductionBrief, false)
})

test("Product Creator preserves honest physical-product boundary", () => {
  const parts = splitProductArtifactBody(
    "PRODUCTION BRIEF\nMaterials and dimensions.\n\nSELLER LAUNCH KIT\nPackaging copy.",
    "physical-product",
  )

  assert.equal(parts.deliverableHeading, "Production Brief")
  assert.equal(parts.deliverableBody, "Materials and dimensions.")
  assert.equal(parts.sellerLaunchKit, "Packaging copy.")
  assert.equal(parts.physicalProductionBrief, true)
})
