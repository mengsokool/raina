import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { Navbar } from "../../components/Navbar";
import { Footer } from "../../components/Footer";
import { BookOpen, ChevronDown, Cpu, Terminal, Radio, Globe } from "lucide-react";

const navItems = [
  {
    title: "Getting Started",
    items: [{ label: "Introduction & Overview", to: "/docs", icon: BookOpen }],
  },
  {
    title: "Protocol & SDKs",
    items: [
      { label: "RLP v1 Protocol Spec", to: "/docs/rlp", icon: Radio },
      { label: "Arduino & ESP32 SDK", to: "/docs/sdk", icon: Cpu },
    ],
  },
  {
    title: "Operations & Deployment",
    items: [
      { label: "Self-Host & Raina CLI", to: "/docs/self-host", icon: Terminal },
      { label: "REST Telemetry API", to: "/docs/api", icon: Globe },
    ],
  },
];

function DocsNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Documentation" className="space-y-5">
      {navItems.map((group) => (
        <div key={group.title}>
          <h2 className="mb-1 px-3 text-xs font-semibold text-muted-foreground">
            {group.title}
          </h2>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/docs"}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary ${
                      isActive
                        ? "bg-primary font-semibold text-primary-foreground"
                        : "font-medium text-foreground hover:bg-accent"
                    }`
                  }
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export default function DocsLayout() {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const mobileMenu = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPage = navItems.flatMap((group) => group.items).find((item) => item.to === pathname);

  const closeMenu = () => {
    setMenuOpen(false);
    setMenuClosing(true);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    const closeMs = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--dropdown-close-dur"),
    ) || 150;
    closeTimer.current = setTimeout(() => setMenuClosing(false), closeMs);
  };

  const toggleMenu = () => {
    if (menuOpen) {
      closeMenu();
    } else {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      setMenuClosing(false);
      setMenuOpen(true);
    }
  };

  useEffect(() => {
    setMenuOpen(false);
    setMenuClosing(false);
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, [pathname]);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!mobileMenu.current?.contains(event.target as Node)) closeMenu();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
        mobileMenu.current?.querySelector("button")?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Navbar />

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-5 pb-10 md:flex-row md:gap-10 md:px-8 md:py-14 lg:gap-16">
        <aside className="sticky top-[68px] z-20 -mx-5 w-[calc(100%+2.5rem)] shrink-0 self-start bg-background md:static md:mx-0 md:w-60 md:self-stretch md:bg-transparent">
          <div
            ref={mobileMenu}
            className="group relative border-b border-border md:hidden"
          >
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-controls="mobile-docs-nav"
              onClick={toggleMenu}
              className="flex min-h-15 w-full cursor-pointer items-center gap-3 px-5 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-muted-foreground">Documentation</span>
                <span className="block truncate font-display text-base font-semibold text-foreground">
                  {currentPage?.label ?? "Browse docs"}
                </span>
              </span>
              <ChevronDown className={`size-4 shrink-0 text-foreground transition-transform duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] motion-reduce:transition-none ${menuOpen ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            <div
              id="mobile-docs-nav"
              data-origin="top-center"
              aria-hidden={!menuOpen}
              inert={!menuOpen}
              className={`t-dropdown absolute inset-x-0 top-full max-h-[calc(100dvh-128px)] overflow-y-auto border-b border-border bg-background px-5 py-5 shadow-[0_8px_12px_-8px_rgba(0,0,0,0.22)] ${menuOpen ? "is-open" : menuClosing ? "is-closing" : ""}`}
            >
              <DocsNav onNavigate={closeMenu} />
            </div>
          </div>

          <div className="hidden md:sticky md:top-24 md:block">
            <div className="mb-5 border-b border-border pb-2 font-display text-lg font-semibold tracking-tight">
              Documentation
            </div>
            <DocsNav />
          </div>
        </aside>

        <main className="docs-content min-w-0 flex-1 pb-16">
          <Outlet />
        </main>
      </div>

      <Footer />
    </div>
  );
}
