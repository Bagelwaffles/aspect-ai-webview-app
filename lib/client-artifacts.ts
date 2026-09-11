export type ArtifactSection = {
  heading?: string
  text?: string
  items?: string[]
  orderedItems?: string[]
}

export type BrandedArtifactInput = {
  title: string
  eyebrow?: string
  subtitle?: string
  sections: ArtifactSection[]
  footer?: string
}

export function escapeArtifactHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

export function artifactFilename(value: string, suffix = "artifact"): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72)
  return `${slug || "ams"}-${suffix}.html`
}

function renderText(value: string): string {
  return `<div class="artifact-text">${escapeArtifactHtml(value)}</div>`
}

function renderItems(items: string[], ordered: boolean): string {
  const tag = ordered ? "ol" : "ul"
  return `<${tag}>${items.map((item) => `<li>${escapeArtifactHtml(item)}</li>`).join("")}</${tag}>`
}

export function buildBrandedHtmlArtifact(input: BrandedArtifactInput): string {
  const eyebrow = input.eyebrow?.trim()
  const subtitle = input.subtitle?.trim()
  const footer = input.footer?.trim() || "Created with Aspect Marketing Solutions"
  const sections = input.sections
    .filter((section) => section.heading || section.text || section.items?.length || section.orderedItems?.length)
    .map((section) => [
      "<section>",
      section.heading ? `<h2>${escapeArtifactHtml(section.heading)}</h2>` : "",
      section.text ? renderText(section.text) : "",
      section.items?.length ? renderItems(section.items, false) : "",
      section.orderedItems?.length ? renderItems(section.orderedItems, true) : "",
      "</section>",
    ].join(""))
    .join("")

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeArtifactHtml(input.title)}</title>
<style>
  :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f4f4f7; color: #15151b; }
  main { width: min(860px, calc(100% - 32px)); margin: 32px auto; background: white; border: 1px solid #dedee7; border-radius: 20px; padding: 48px; box-shadow: 0 18px 50px rgba(25, 20, 45, 0.08); }
  .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 34px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; font-size: 12px; }
  .mark { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; background: #6d28d9; color: white; font-size: 20px; }
  .eyebrow { margin: 0 0 10px; color: #6d28d9; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; font-size: 12px; }
  h1 { margin: 0; font-size: clamp(32px, 6vw, 54px); line-height: 1.02; letter-spacing: -0.045em; }
  .subtitle { margin: 16px 0 0; color: #5f6070; font-size: 17px; line-height: 1.6; }
  section { margin-top: 34px; padding-top: 28px; border-top: 1px solid #e8e8ef; }
  h2 { margin: 0 0 14px; font-size: 20px; }
  .artifact-text { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 15px; line-height: 1.75; }
  ul, ol { margin: 12px 0 0; padding-left: 24px; }
  li { margin: 8px 0; line-height: 1.6; }
  footer { margin-top: 42px; padding-top: 20px; border-top: 1px solid #e8e8ef; color: #777887; font-size: 12px; }
  @media (max-width: 640px) { main { width: 100%; margin: 0; border: 0; border-radius: 0; padding: 28px 20px; box-shadow: none; } }
  @media print { body { background: white; } main { width: 100%; margin: 0; border: 0; border-radius: 0; padding: 0; box-shadow: none; } }
</style>
</head>
<body>
<main>
  <div class="brand"><span class="mark">A</span><span>Aspect Marketing Solutions</span></div>
  ${eyebrow ? `<p class="eyebrow">${escapeArtifactHtml(eyebrow)}</p>` : ""}
  <h1>${escapeArtifactHtml(input.title)}</h1>
  ${subtitle ? `<p class="subtitle">${escapeArtifactHtml(subtitle)}</p>` : ""}
  ${sections}
  <footer>${escapeArtifactHtml(footer)}</footer>
</main>
</body>
</html>`
}

export function downloadHtmlArtifact(filename: string, html: string): boolean {
  if (typeof document === "undefined" || typeof URL === "undefined") return false
  const blob = new Blob([html], { type: "text/html;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename.endsWith(".html") ? filename : `${filename}.html`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
  return true
}

export function printHtmlArtifact(html: string): boolean {
  if (typeof window === "undefined") return false
  const popup = window.open("", "_blank")
  if (!popup) return false
  popup.document.open()
  popup.document.write(html)
  popup.document.close()
  popup.focus()
  window.setTimeout(() => popup.print(), 150)
  return true
}
