import React from "react";
import { useLocation } from "react-router";
import { useShell } from "./ShellContext";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShellLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const {
    projects,
    currentProjectId,
    setCurrentProjectId,
    sidebarCollapsed,
    mobileMenuOpen,
    closeMobileMenu,
  } = useShell();

  const isEditor = pathname.includes("/edit") || pathname.includes("/editor");

  return (
    <div className="flex h-full h-dvh overflow-hidden bg-background text-foreground">
      {/* Desktop Sidebar (visible on md+) - Full height with App Icon & Collapse button at top */}
      <div
        className={`hidden md:flex flex-col shrink-0 h-full transition-all duration-200 ease-in-out border-r border-border bg-card overflow-hidden ${
          sidebarCollapsed ? "w-14" : "w-56"
        }`}
      >
        <Sidebar
          projects={projects}
          currentProjectId={currentProjectId}
          onSelectProject={setCurrentProjectId}
        />
      </div>

      {/* Main Column (Topbar + Main Viewport Content) */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          projects={projects}
          currentProjectId={currentProjectId}
          onSelectProject={setCurrentProjectId}
        />

        {/* Main Viewport Content */}
        <main
          className={`flex-1 min-h-0 min-w-0 bg-background ${
            isEditor ? "flex flex-col overflow-hidden" : "overflow-y-auto"
          }`}
        >
          {children}
        </main>
      </div>

      {/* Mobile Sheet / Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          onClick={closeMobileMenu}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity md:hidden animate-in fade-in"
          aria-hidden="true"
        />
      )}

      {/* Mobile Sheet Drawer Slide-over from RIGHT */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-64 bg-card shadow-2xl transition-transform duration-300 ease-in-out md:hidden border-l border-border ${
          mobileMenuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <Sidebar
          projects={projects}
          currentProjectId={currentProjectId}
          onSelectProject={setCurrentProjectId}
          isMobile={true}
        />
      </div>
    </div>
  );
}
