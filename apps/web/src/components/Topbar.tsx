import React from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ChevronDown, ChevronLeft, Folder, Menu } from "lucide-react";
import { useShell } from "./ShellContext";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";

function getNavigationContext(pathname: string, pid?: string) {
  if (pid && pathname.startsWith(`/p/${pid}`)) {
    const subPath = pathname.slice(`/p/${pid}`.length);
    const segments = subPath.split("/").filter(Boolean);

    const section = segments[0] || "dashboards";
    const sectionLabels: Record<string, string> = {
      dashboards: "Dashboards",
      device: "Devices",
      variables: "Variables",
      automations: "Automations",
      users: "Users",
    };

    const sectionName = sectionLabels[section] || section;

    // Sub-route: Dashboard Editor /p/:pid/dashboards/:id/edit
    if (section === "dashboards" && segments[2] === "edit") {
      return {
        backTarget: `/p/${pid}/dashboards/${segments[1]}`,
        backLabel: "Back to dashboard",
        sectionName,
        sectionPath: `/p/${pid}/dashboards`,
        subPageName: "Edit",
      };
    }

    // Sub-route: Dashboard View /p/:pid/dashboards/:id
    if (section === "dashboards" && segments[1]) {
      return {
        backTarget: `/p/${pid}/dashboards`,
        backLabel: "Back to dashboards",
        sectionName,
        sectionPath: `/p/${pid}/dashboards`,
        subPageName: null,
      };
    }

    // Sub-route: Automation Editor /p/:pid/automations/editor
    if (section === "automations" && segments[1] === "editor") {
      return {
        backTarget: `/p/${pid}/automations`,
        backLabel: "Back to automations",
        sectionName,
        sectionPath: `/p/${pid}/automations`,
        subPageName: "Editor",
      };
    }

    // Section Root: /p/:pid/dashboards, /p/:pid/device, etc.
    return {
      backTarget: "/projects",
      backLabel: "All projects",
      sectionName: segments.length > 0 ? sectionName : null,
      sectionPath: segments.length > 0 ? `/p/${pid}/${section}` : null,
      subPageName: null,
    };
  }

  // Account / Settings routes
  if (pathname.startsWith("/settings/")) {
    return {
      backTarget: "/settings",
      backLabel: "Back to Settings",
      sectionName: "Settings",
      sectionPath: "/settings",
      subPageName: pathname.includes("staff") ? "Staff" : null,
    };
  }

  return {
    backTarget: null,
    backLabel: null,
    sectionName: null,
    sectionPath: null,
    subPageName: null,
  };
}

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
  const { toggleMobileMenu, isClient } = useShell();

  const currentProject = projects.find((p) => p.id === currentProjectId) ?? projects[0];
  const isProjectContext = pathname.startsWith("/p/");
  const navCtx = getNavigationContext(pathname, currentProjectId);

  const pageTitle = pathname.startsWith("/settings/staff") || pathname.startsWith("/settings/users")
    ? "Staff"
    : pathname.startsWith("/settings")
    ? "Settings"
    : "Projects";

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-2.5 sm:h-10.5 sm:px-3.5 select-none text-foreground">
      {/* Left: Smart Back Button + Project Selector / Breadcrumb Trail */}
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
        <TooltipProvider delayDuration={200}>
          {navCtx.backTarget && !isClient && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  asChild
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label={navCtx.backLabel || "Back"}
                >
                  <Link to={navCtx.backTarget}>
                    <ChevronLeft className="size-4" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start" sideOffset={6}>
                {navCtx.backLabel}
              </TooltipContent>
            </Tooltip>
          )}
        </TooltipProvider>

        {isProjectContext ? (
          <div className="flex items-center gap-1 min-w-0 text-xs">
            {/* Project Switcher Dropdown */}
            {onSelectProject && currentProject ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1 px-1.5 font-bold text-xs max-w-44 sm:max-w-60"
                    title={currentProject.name}
                  >
                    <span className="truncate">{currentProject.name}</span>
                    <ChevronDown className="size-3 text-muted-foreground shrink-0" />
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="start" className="w-56 z-50">
                  <DropdownMenuLabel>
                    Switch Project
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <div className="max-h-60 overflow-y-auto">
                    {projects.map((p) => {
                      const isSelected = p.id === currentProjectId;
                      return (
                        <DropdownMenuCheckboxItem
                          key={p.id}
                          checked={isSelected}
                          onCheckedChange={() => onSelectProject(p.id)}
                          className="cursor-pointer"
                        >
                          <span className="truncate">{p.name}</span>
                        </DropdownMenuCheckboxItem>
                      );
                    })}
                  </div>
                  {!isClient && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => navigate("/projects")}
                        className="cursor-pointer"
                      >
                        <Folder className="size-3.5" />
                        <span>All projects</span>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <span className="text-xs font-bold text-foreground px-1 truncate">
                {currentProject?.name}
              </span>
            )}

            {/* Breadcrumb Section / Subpage */}
            {navCtx.sectionName && (
              <>
                <span className="text-muted-foreground/40 font-normal">/</span>
                {navCtx.sectionPath && navCtx.subPageName ? (
                  <Link
                    to={navCtx.sectionPath}
                    className="text-muted-foreground hover:text-foreground transition-colors truncate hidden sm:inline"
                  >
                    {navCtx.sectionName}
                  </Link>
                ) : (
                  <span className="text-foreground truncate font-medium">
                    {navCtx.sectionName}
                  </span>
                )}
              </>
            )}

            {navCtx.subPageName && (
              <>
                <span className="text-muted-foreground/40 font-normal">/</span>
                <span className="text-foreground truncate font-medium">
                  {navCtx.subPageName}
                </span>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-1">
            <span className="text-xs font-bold text-foreground">
              {pageTitle}
            </span>
          </div>
        )}
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-1.5">
        <div id="topbar-actions" className="flex items-center gap-1.5" />
        <ThemeToggle />

        {/* Mobile Hamburger Drawer Trigger (Far Right) */}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={toggleMobileMenu}
          className="md:hidden shrink-0 text-muted-foreground hover:text-foreground"
          title="Open menu"
          aria-label="Open menu"
        >
          <Menu className="size-4" />
        </Button>
      </div>
    </header>
  );
}

