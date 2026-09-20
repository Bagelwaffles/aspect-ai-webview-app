import Link from "next/link"

export function AmsPublicFooter() {
  return (
    <footer className="ams-public-footer">
      <div className="ams-public-footer__inner">
        <Link href="/" className="ams-public-brand" aria-label="Aspect Marketing Solutions home">
          <span className="ams-public-brand__mark">A</span>
          <span className="ams-public-brand__name">Aspect <strong>Marketing Solutions</strong></span>
        </Link>
        <nav className="ams-public-footer__nav" aria-label="Footer navigation">
          <Link href="/agents">Agents</Link>
          <Link href="/creators">Creators</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/quick-marketing-audit">$49 Audit</Link>
          <Link href="/contact">Contact</Link>
        </nav>
        <p>© 2026 Aspect Marketing Solutions</p>
      </div>
    </footer>
  )
}
