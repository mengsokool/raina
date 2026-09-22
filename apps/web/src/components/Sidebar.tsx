import React from "react";
import { Link, useLocation } from "react-router";
import { LogOut, PanelLeftClose, X } from "lucide-react";
import { useShell } from "./ShellContext";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

// ─── Icons ───────────────────────────────────────────────────────────────────

const ICON_PATHS: Record<string, string> = {
  home: "M2.25 12 12 2.25 21.75 12M4.5 9.75v9.75a.75.75 0 0 0 .75.75H9.75V15h4.5v5.25h4.5a.75.75 0 0 0 .75-.75V9.75",
  folder:
    "M3.75 9.75h16.5M3.75 9.75A1.5 1.5 0 0 1 5.25 8.25h3.879a1.5 1.5 0 0 1 1.06.44l1.122 1.121a1.5 1.5 0 0 0 1.06.44h6.379a1.5 1.5 0 0 1 1.5 1.5v6.75a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5V9.75Z",
  dashboards:
    "M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z",
  variable:
    "M4.745 3A23.933 23.933 0 0 0 3 12c0 3.183.62 6.22 1.745 9M19.5 3c.967 2.78 1.5 5.817 1.5 9s-.533 6.22-1.5 9M8.25 8.885l1.444-.89a.75.75 0 0 1 1.105.402l2.402 7.206a.75.75 0 0 0 1.104.401l1.445-.889m-8.25.75.213.09a1.687 1.687 0 0 0 2.062-.617l4.45-6.676a1.688 1.688 0 0 1 2.062-.618l.213.09",
  device:
    "M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z",
  bolt: "M3.75 13.5 14.25 2.25v8.25h6L9.75 21.75V13.5h-6Z",
  users:
    "M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M21 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  settings:
    "M4.5 12a7.5 7.5 0 0 0 .104 1.243l-1.32 1.02a.75.75 0 0 0-.176.957l1.5 2.598a.75.75 0 0 0 .912.328l1.561-.624a7.45 7.45 0 0 0 2.155 1.244l.236 1.66a.75.75 0 0 0 .742.643h3a.75.75 0 0 0 .742-.643l.237-1.66a7.45 7.45 0 0 0 2.154-1.244l1.561.624a.75.75 0 0 0 .912-.328l1.5-2.598a.75.75 0 0 0-.176-.957l-1.32-1.02A7.51 7.51 0 0 0 19.5 12c0-.42-.035-.832-.103-1.232l1.319-1.02a.75.75 0 0 0 .176-.958l-1.5-2.598a.75.75 0 0 0-.912-.327l-1.561.624A7.46 7.46 0 0 0 14.764 5.245l-.236-1.66A.75.75 0 0 0 13.786 3h-3a.75.75 0 0 0-.742.643l-.237 1.66a7.45 7.45 0 0 0-2.154 1.244l-1.561-.624a.75.75 0 0 0-.912.327l-1.5 2.598a.75.75 0 0 0 .176.958l1.32 1.02C4.535 11.168 4.5 11.58 4.5 12Zm10.5 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  overview:
    "M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z",
  key:
    "M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z",
};

function NavIcon({ name }: { name: string }) {
  const d = ICON_PATHS[name];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4.5 shrink-0"
    >
      <path d={d} />
    </svg>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────────────

const ACTIVE =
  "bg-primary text-primary-foreground font-semibold shadow-2xs";
const INACTIVE =
  "text-muted-foreground hover:bg-accent hover:text-foreground font-medium";

function NavLink({
  href,
  icon,
  label,
  active,
  collapsed,
}: {
  href: string;
  icon: string;
  label: string;
  active: boolean;
  collapsed: boolean;
}) {
  const linkContent = (
    <Link
      to={href}
      className={`flex items-center rounded-sm py-1.5 text-xs transition-colors max-sm:py-3 max-sm:text-sm max-sm:gap-3 ${
        collapsed ? "justify-center px-0 size-8 mx-auto max-sm:size-11" : "gap-2.5 px-2 max-sm:px-3"
      } ${active ? ACTIVE : INACTIVE}`}
    >
      <NavIcon name={icon} />
      {!collapsed && <span className="truncate font-medium">{label}</span>}
    </Link>
  );

  if (collapsed) {
    return (
      <li>
        <Tooltip>
          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={12}>
            {label}
          </TooltipContent>
        </Tooltip>
      </li>
    );
  }

  return <li>{linkContent}</li>;
}

function NavSection({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) return <div className="my-2.5 border-t border-border" />;
  return (
    <div className="mb-1 mt-3.5 px-2">
      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function SidebarHeader({
  collapsed,
  isMobile = false,
}: {
  collapsed: boolean;
  isMobile?: boolean;
}) {
  const { toggleSidebar, closeMobileMenu } = useShell();

  return (
    <div
      className={`flex h-14 sm:h-10.5 shrink-0 items-center border-b border-border px-3 sm:px-2.5 ${
        collapsed ? "justify-center" : "justify-between"
      }`}
    >
      {collapsed ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={toggleSidebar}
          className="size-7 p-0 grid place-items-center rounded-sm text-foreground hover:bg-accent"
          title="Expand sidebar"
          aria-label="Expand sidebar"
        >
          <img src="/raina-mark-128.png" alt="Raina" className="size-4.5" />
        </Button>
      ) : (
        <>
          <Link
            to="/projects"
            className="flex items-center gap-2 min-w-0 font-semibold text-xs text-foreground focus:outline-none group"
          >
            <img src="/raina-mark-128.png" alt="Raina" className="size-4.5 shrink-0" />
            <span className="font-bold text-xs tracking-tight truncate">raina</span>
          </Link>

          {!isMobile ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={toggleSidebar}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose className="size-3.5" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={closeMobileMenu}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              title="Close menu"
              aria-label="Close menu"
            >
              <X className="size-4" />
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function UserFooter({ collapsed }: { collapsed: boolean }) {
  const { currentUser, signOut } = useShell();

  const initials = currentUser?.name
    ? currentUser.name.slice(0, 2).toUpperCase()
    : (currentUser?.username || "U").slice(0, 2).toUpperCase();

  if (collapsed) {
    return (
      <div className="border-t border-border p-1.5 flex flex-col items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to="/settings"
              aria-label="Account Settings"
              className="grid size-7 place-items-center rounded-none bg-muted text-xs font-semibold text-foreground border border-border hover:border-foreground/50 transition-colors"
            >
              {initials}
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={12}>
            Settings ({currentUser?.username || "user"})
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="border-t border-border p-1.5 flex items-center justify-between gap-1">
      <Link
        to="/settings"
        title="Account Settings"
        className="flex items-center gap-2 min-w-0 flex-1 p-1 rounded-none hover:bg-accent/60 transition-colors group"
      >
        <div className="grid size-7 shrink-0 place-items-center rounded-none bg-muted text-xs font-semibold text-foreground border border-border group-hover:border-foreground/50 transition-colors">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-foreground leading-tight">
            {currentUser?.name || currentUser?.username || "User"}
          </div>
          <div className="truncate text-xs text-muted-foreground font-mono leading-tight mt-0.5">
            {currentUser?.username || "user"} ({currentUser?.role || "member"})
          </div>
        </div>
      </Link>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="destructive-ghost"
            size="icon-sm"
            onClick={signOut}
            title="Log out"
            aria-label="Log out"
          >
            <LogOut className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={8}>
          Log out
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

// ─── Account Sidebar ─────────────────────────────────────────────────────────
// Shown on: /, /projects, /settings/*

function AccountSidebar({ isMobile = false }: { isMobile?: boolean }) {
  const { pathname } = useLocation();
  const { sidebarCollapsed } = useShell();
  const effectiveCollapsed = isMobile ? false : sidebarCollapsed;

  return (
    <TooltipProvider delayDuration={0}>
      <aside className="flex h-full w-full shrink-0 flex-col bg-card select-none">
        <SidebarHeader collapsed={effectiveCollapsed} isMobile={isMobile} />

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <ul className="space-y-1">
            <NavLink
              href="/projects"
              icon="folder"
              label="Projects"
              active={pathname.startsWith("/projects")}
              collapsed={effectiveCollapsed}
            />
          </ul>

          <NavSection label="Account" collapsed={effectiveCollapsed} />
          <ul className="space-y-1">
            <NavLink
              href="/settings/staff"
              icon="users"
              label="Staff"
              active={
                pathname === "/settings/staff" ||
                pathname.startsWith("/settings/staff/") ||
                pathname === "/settings/users"
              }
              collapsed={effectiveCollapsed}
            />
            <NavLink
              href="/settings"
              icon="settings"
              label="Settings"
              active={pathname === "/settings"}
              collapsed={effectiveCollapsed}
            />
          </ul>
        </nav>

        <UserFooter collapsed={effectiveCollapsed} />
      </aside>
    </TooltipProvider>
  );
}

// ─── Project Sidebar ─────────────────────────────────────────────────────────
// Shown on: /p/[proj]/*

function ProjectSidebar({
  currentProjectId,
  isMobile = false,
}: {
  currentProjectId: string;
  isMobile?: boolean;
}) {
  const { pathname } = useLocation();
  const { sidebarCollapsed, isClient, currentUser } = useShell();
  const pid = currentProjectId;
  const effectiveCollapsed = isMobile ? false : sidebarCollapsed;

  // For Client users: only show authorized dashboards
  if (isClient) {
    const clientDashboards =
      currentUser?.accessibleDashboards?.filter((d) => d.projectId === pid) || [];

    return (
      <TooltipProvider delayDuration={0}>
        <aside className="flex h-full w-full shrink-0 flex-col bg-card select-none">
          <SidebarHeader collapsed={effectiveCollapsed} isMobile={isMobile} />
          <nav className="flex-1 overflow-y-auto px-2 py-3">
            <NavSection label="Dashboards" collapsed={effectiveCollapsed} />
            <ul className="space-y-1">
              {clientDashboards.map((d) => (
                <NavLink
                  key={d.id}
                  href={`/p/${pid}/dashboards/${d.id}`}
                  icon="dashboards"
                  label={d.name}
                  active={pathname.includes(`/dashboards/${d.id}`)}
                  collapsed={effectiveCollapsed}
                />
              ))}
            </ul>
          </nav>
          <UserFooter collapsed={effectiveCollapsed} />
        </aside>
      </TooltipProvider>
    );
  }

  const projectNav = [
    {
      href: `/p/${pid}/dashboards`,
      icon: "dashboards",
      label: "Dashboards",
      active:
        pathname === `/p/${pid}` ||
        pathname.startsWith(`/p/${pid}/dashboards`) ||
        pathname.startsWith(`/p/${pid}/d/`),
    },
    {
      href: `/p/${pid}/device`,
      icon: "device",
      label: "Devices",
      active: pathname.startsWith(`/p/${pid}/device`),
    },
    {
      href: `/p/${pid}/variables`,
      icon: "variable",
      label: "Variables",
      active: pathname.startsWith(`/p/${pid}/variables`),
    },
    {
      href: `/p/${pid}/automations`,
      icon: "bolt",
      label: "Automations",
      active: pathname.startsWith(`/p/${pid}/automations`),
    },
    {
      href: `/p/${pid}/users`,
      icon: "users",
      label: "Users",
      active: pathname.startsWith(`/p/${pid}/users`),
    },
  ];

  return (
    <TooltipProvider delayDuration={0}>
      <aside className="flex h-full w-full shrink-0 flex-col bg-card select-none">
        <SidebarHeader collapsed={effectiveCollapsed} isMobile={isMobile} />

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <ul className="space-y-1">
            {projectNav.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                active={item.active}
                collapsed={effectiveCollapsed}
              />
            ))}
          </ul>
        </nav>

        <UserFooter collapsed={effectiveCollapsed} />
      </aside>
    </TooltipProvider>
  );
}

// ─── Public export ────────────────────────────────────────────────────────────

export function Sidebar({
  currentProjectId,
  isMobile = false,
}: {
  projects?: { id: string; name: string }[];
  currentProjectId?: string;
  onSelectProject?: (id: string) => void;
  isMobile?: boolean;
}) {
  const { pathname } = useLocation();
  const isProjectContext = pathname.startsWith("/p/");

  if (isProjectContext && currentProjectId) {
    return (
      <ProjectSidebar
        currentProjectId={currentProjectId}
        isMobile={isMobile}
      />
    );
  }

  return <AccountSidebar isMobile={isMobile} />;
}
