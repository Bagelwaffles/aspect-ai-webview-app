"use client"

import Link from "next/link"
import { useEffect, useRef } from "react"

export function AmsPublicHeader() {
  const menuRef = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    const closeOnOutside = (event: PointerEvent) => {
      const menu = menuRef.current
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      const menu = menuRef.current
      if (event.key === "Escape" && menu?.open) {
        menu.open = false
        menu.querySelector("summary")?.focus()
      }
    }
    document.addEventListener("pointerdown", closeOnOutside)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [])

  return (
    <header className="ams-public-header">
      <a href="#main-content" className="ams-public-skip">Skip to content</a>
      <div className="ams-public-header__inner">
        <Link href="/" className="ams-public-brand" aria-label="Aspect Marketing Solutions home">
          <span className="ams-public-brand__mark" aria-hidden="true">A</span>
          <span className="ams-public-brand__name">Aspect <strong>Marketing Solutions</strong></span>
        </Link>

        <nav className="ams-public-nav" aria-label="Primary navigation">
          <Link href="/agents">Agents</Link>
          <Link href="/#how-it-works">How it works</Link>
          <Link href="/creators">Creators</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/quick-marketing-audit">Marketing Audit</Link>
          <Link href="/contact">Get started</Link>
        </nav>

        <details ref={menuRef} className="ams-public-mobile-nav" onBlur={(event) => {
          if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false
        }}>
          <summary aria-label="Site navigation">Menu</summary>
          <nav className="ams-public-mobile-nav__panel" aria-label="Mobile navigation" onClick={(event) => {
            if (event.target instanceof Element && event.target.closest("a") && menuRef.current) menuRef.current.open = false
          }}>
            <Link href="/agents">Explore agents</Link>
            <Link href="/#how-it-works">How it works</Link>
            <Link href="/creators">Creator OS</Link>
            <Link href="/pricing">Pricing and plans</Link>
            <Link href="/quick-marketing-audit">Quick Marketing Audit</Link>
            <Link href="/contact">Get started</Link>
            <Link href="/privacy">Privacy and trust</Link>
          </nav>
        </details>

        <Link href="/login?next=/agents" className="ams-public-signin">Sign in</Link>
      </div>
    </header>
  )
}
