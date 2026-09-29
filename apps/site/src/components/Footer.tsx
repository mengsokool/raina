import { Link } from "react-router";
import { ArrowUpRight } from "lucide-react";
import { GithubIcon } from "./Icons";

export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="flex flex-col justify-between gap-8 border-b border-border pb-12 sm:flex-row sm:items-end">
          <div>
            <Link to="/" className="inline-flex items-center gap-2.5 font-display text-2xl font-semibold tracking-[-0.055em] text-foreground">
              <img src="/raina-mark-128.png" alt="" width="28" height="28" className="size-7" />
              raina
            </Link>
            <p className="mt-4 max-w-[34ch] text-sm leading-relaxed text-muted-foreground">
              Connect your hardware. Keep the platform yours.
            </p>
          </div>
          <Link to="/docs/self-host" className="site-button-primary inline-flex h-8.5 items-center gap-1.5 px-4 text-xs font-bold rounded-sm shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            Install <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>

        <div className="flex flex-col justify-between gap-6 pt-7 text-xs text-muted-foreground lg:flex-row lg:items-center">
          <p>© {new Date().getFullYear()} Raina IoT. Released under MIT.</p>
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link to="/docs" className="hover:text-foreground">Documentation</Link>
            <Link to="/docs/rlp" className="hover:text-foreground">RLP Protocol</Link>
            <Link to="/docs/sdk" className="hover:text-foreground">Firmware SDK</Link>
            <Link to="/docs/self-host" className="hover:text-foreground">Self-Host Guide</Link>
            <a href="https://github.com/mengsokool/raina" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-foreground">
              <GithubIcon className="size-4" /> GitHub
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
