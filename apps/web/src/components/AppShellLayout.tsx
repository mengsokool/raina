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
    <div className="flex h-full h-dvh flex-col overflow-hidden bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
      {/* Topbar spans FULL width at top */}
      <Topbar
        projects={projects}
        currentProjectId={currentProjectId}
        onSelectProject={setCurrentProjectId}
      />

      {/* Content Area: Sidebar + Main Content */}
      <div className="flex min-h-0 flex-1 overflow-hidden relative">
        {/* Desktop Sidebar (visible on md+) */}
        <div
          className={`hidden md:block transition-all duration-200 ease-in-out shrink-0 overflow-hidden ${
            sidebarCollapsed ? "w-16" : "w-56"
          }`}
        >
          <Sidebar
            projects={projects}
            currentProjectId={currentProjectId}
            onSelectProject={setCurrentProjectId}
          />
        </div>

        {/* Mobile Sheet / Drawer Backdrop */}
        {mobileMenuOpen && (
          <div
            onClick={closeMobileMenu}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity md:hidden animate-in fade-in"
            aria-hidden="true"
          />
        )}

        {/* Mobile Sheet Drawer Slide-over */}
        <div
          className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-neutral-900 shadow-2xl transition-transform duration-300 ease-in-out md:hidden ${
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <Sidebar
            projects={projects}
            currentProjectId={currentProjectId}
            onSelectProject={setCurrentProjectId}
            isMobile={true}
          />
        </div>

        {/* Main Viewport Content */}
        <main
          className={`flex-1 min-h-0 min-w-0 bg-neutral-50 dark:bg-neutral-950 ${
            isEditor ? "overflow-hidden" : "overflow-y-auto"
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
