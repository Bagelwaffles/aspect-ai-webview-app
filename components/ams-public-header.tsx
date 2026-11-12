import Link from "next/link"

export function AmsPublicHeader() {
  return (
    <header className="ams-public-header">
      <div className="ams-public-header__inner">
        <Link href="/" className="ams-public-brand" aria-label="Aspect Marketing Solutions home">
          <span className="ams-public-brand__mark" aria-hidden="true">A</span>
          <span className="ams-public-brand__name">Aspect <strong>Marketing Solutions</strong></span>
        </Link>

        <nav className="ams-public-nav" aria-label="Primary navigation">
          <Link href="/agents">Agents</Link>
          <Link href="/creators">Creators</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/quick-marketing-audit">Marketing Audit</Link>
          <Link href="/contact">Get started</Link>
        </nav>

        <details className="ams-public-mobile-nav">
          <summary aria-label="Open site navigation">Menu</summary>
          <nav className="ams-public-mobile-nav__panel" aria-label="Mobile navigation">
            <Link href="/agents">Explore agents</Link>
            <Link href="/creators">Creator OS</Link>
            <Link href="/pricing">Pricing and plans</Link>
            <Link href="/quick-marketing-audit">Quick Marketing Audit</Link>
            <Link href="/contact">Get started</Link>
            <Link href="/privacy">Privacy and trust</Link>
          </nav>
        </details>

        <Link href="/login?next=/dashboard" className="ams-public-signin">Sign in</Link>
      </div>
    </header>
  )
}
