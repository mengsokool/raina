import { Link, NavLink } from "react-router";

export function Navbar() {
  return (
    <header className="site-nav sticky top-0 z-30 border-b border-border">
      <div className="mx-auto flex h-[68px] w-full max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link
          to="/"
          aria-label="Raina home"
          className="inline-flex shrink-0 items-center gap-2.5 rounded-sm font-display text-xl font-semibold tracking-[-0.055em] text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          <img src="/raina-mark-128.png" alt="" width="26" height="26" className="size-[26px]" />
          raina
        </Link>

        <nav aria-label="Primary" className="flex shrink-0 items-center gap-4 sm:gap-6">
          <NavLink to="/docs" end className="site-nav-link">Docs</NavLink>
          <Link
            to="/docs/self-host"
            className="site-button-primary inline-flex h-8.5 items-center px-3.5 text-xs font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:px-4"
          >
            Install
          </Link>
        </nav>
      </div>
    </header>
  );
}
