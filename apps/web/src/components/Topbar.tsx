import React from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ChevronDown, Check, Folder, ChevronRight, Menu, PanelLeft, PanelLeftClose } from "lucide-react";
import { useShell } from "./ShellContext";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Topbar({
  projects = [],
  currentProjectId,
  onSelectProject,
}: {
  projects: { id: string; name: string }[];
  currentProjectId?: string;
  onSelectProject?: (id: string) => void;
}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { toggleMobileMenu, isClient, sidebarCollapsed, toggleSidebar } = useShell();

  const currentProject = projects.find((p) => p.id === currentProjectId) ?? projects[0];
  const isProjectContext = pathname.startsWith("/p/");

  const pageTitle = pathname.startsWith("/settings/staff") || pathname.startsWith("/settings/users")
    ? "Staff"
    : pathname.startsWith("/settings")
    ? "Settings"
    : "Projects";

  return (
    <header className="relative z-30 flex h-10 sm:h-10.5 shrink-0 items-center justify-between gap-2 border-b border-neutral-200 bg-white px-2 sm:px-3.5 dark:border-neutral-800 dark:bg-neutral-900 select-none">
      {/* Left: Desktop Sidebar Toggle + Mobile Hamburger + Project Selector / Title */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-visible">
        {/* Desktop Sidebar Collapse / Expand Toggle */}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={toggleSidebar}
          className="hidden md:inline-flex h-6.5 w-6.5 shrink-0 rounded-none text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? (
            <PanelLeft className="h-3.5 w-3.5" />
          ) : (
            <PanelLeftClose className="h-3.5 w-3.5" />
          )}
        </Button>

        {/* Mobile Hamburger Drawer Trigger */}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={toggleMobileMenu}
          className="md:hidden shrink-0 h-6.5 w-6.5 rounded-none"
          title="Open menu"
          aria-label="Open menu"
        >
          <Menu className="h-3.5 w-3.5" />
        </Button>

        {/* Project Selector or Section Title */}
        <div className="flex min-w-0 items-center gap-1 overflow-hidden">
          {isProjectContext && onSelectProject && currentProject ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs font-semibold text-neutral-900 hover:text-neutral-950 dark:text-neutral-100 dark:hover:text-white shrink-0 gap-1.5 px-2 rounded-none hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  title={currentProject.name}
                >
                  <span className="max-w-[240px] truncate font-bold text-xs">{currentProject.name}</span>
                  <ChevronDown className="h-3 w-3 text-neutral-500" />
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="start" className="w-56 z-50 rounded-none">
                <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                  Switch Project
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="max-h-60 overflow-y-auto">
                  {projects.map((p) => {
                    const isSelected = p.id === currentProjectId;
                    return (
                      <DropdownMenuItem
                        key={p.id}
                        onClick={() => onSelectProject(p.id)}
                        className={`flex items-center justify-between cursor-pointer rounded-none ${
                          isSelected
                            ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100 font-semibold"
                            : "text-neutral-700 dark:text-neutral-300"
                        }`}
                      >
                        <span className="truncate">{p.name}</span>
                        {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                      </DropdownMenuItem>
                    );
                  })}
                </div>
                {!isClient && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => navigate("/projects")}
                      className="cursor-pointer gap-2 text-neutral-500 dark:text-neutral-400 rounded-none"
                    >
                      <Folder className="h-3.5 w-3.5" />
                      <span>All projects</span>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100 px-2">
              {pageTitle}
            </span>
          )}
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-1.5">
        <div id="topbar-actions" className="flex items-center gap-1.5" />
        <ThemeToggle />
      </div>
    </header>
  );
}

