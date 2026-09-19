import React, { createContext, useContext, useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { getCurrentUser, listProjects, type CurrentUser as AuthCurrentUser } from "@/lib/api-client";
import { clearClientSessionAndRedirect } from "@/routes/auth/session";

export interface ProjectMeta {
  id: string;
  name: string;
  description?: string | null;
}

export type AccessibleDashboard = {
  id: string;
  name: string;
  projectId: string;
  canControl: boolean;
};

export type CurrentUser = AuthCurrentUser;

interface ShellContextType {
  currentUser: CurrentUser | null;
  isClient: boolean;
  projects: ProjectMeta[];
  currentProjectId: string;
  setCurrentProjectId: (id: string) => void;
  refreshProjects: () => Promise<void>;
  refreshUser: () => Promise<void>;
  signOut: () => Promise<void>;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  toggleSidebar: () => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  toggleMobileMenu: () => void;
  closeMobileMenu: () => void;
  breadcrumbTitle: string | null;
  setBreadcrumbTitle: React.Dispatch<React.SetStateAction<string | null>>;
}

const ShellContext = createContext<ShellContextType | null>(null);

export function ShellProvider({
  children,
  initialSidebarCollapsed = false,
  initialUser = null,
  initialProjects = [],
}: {
  children: React.ReactNode;
  initialSidebarCollapsed?: boolean;
  initialUser?: CurrentUser | null;
  initialProjects?: ProjectMeta[];
}) {
  const location = useLocation();
  const pathname = location.pathname;
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(initialUser);
  const [projects, setProjects] = useState<ProjectMeta[]>(() => {
    if (initialProjects && initialProjects.length > 0) return initialProjects;
    if (initialUser?.projects && initialUser.projects.length > 0) return initialUser.projects;
    return [];
  });
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => {
    if (initialProjects && initialProjects.length > 0) return initialProjects[0].id;
    if (initialUser?.projects && initialUser.projects.length > 0) return initialUser.projects[0].id;
    return "";
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(initialSidebarCollapsed);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [breadcrumbTitle, setBreadcrumbTitle] = useState<string | null>(null);

  const urlProjectId = pathname.match(/^\/p\/([^/]+)/)?.[1] || "";
  const currentProjectId = urlProjectId || selectedProjectId || projects[0]?.id || "";

  const isClient = currentUser?.role === "client";

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      if (typeof document !== "undefined") {
        document.cookie = `raina_sidebar_collapsed=${next}; Path=/; Max-Age=${365 * 24 * 60 * 60}; SameSite=Lax`;
      }
      return next;
    });
  };

  const toggleMobileMenu = () => setMobileMenuOpen((prev) => !prev);
  const closeMobileMenu = () => setMobileMenuOpen(false);

  // Auto-close mobile sheet and clear page breadcrumb on route navigation
  useEffect(() => {
    setMobileMenuOpen(false);
    setBreadcrumbTitle(null);
  }, [pathname]);

  const fetchUser = async () => {
    try {
      const me = await getCurrentUser();
      setCurrentUser(me);
      if (me.projects && me.projects.length > 0) {
        setProjects(me.projects);
        if (!selectedProjectId) {
          setSelectedProjectId(me.projects[0].id);
        }
      }
      return me;
    } catch (e: any) {
      console.error("Failed to load user", e);
      setCurrentUser(null);
      if (e?.status === 401 && pathname !== "/login" && !pathname.startsWith("/public")) {
        clearClientSessionAndRedirect("/login");
      }
      return null;
    }
  };

  const fetchProjects = async () => {
    try {
      const list = await listProjects();
      setProjects(list);
      if (!selectedProjectId && list.length > 0) {
        setSelectedProjectId(list[0].id);
      }
    } catch (e) {
      console.error("Failed to load projects", e);
    }
  };

  useEffect(() => {
    fetchUser().then((me) => {
      if (me && me.role !== "client") {
        fetchProjects();
      }
    });
  }, []);

  // Route protection for client vs staff
  useEffect(() => {
    if (!currentUser) return;

    if (currentUser.role === "client") {
      // Clients should not access back-office routes
      if (
        pathname.startsWith("/projects") ||
        pathname.startsWith("/settings") ||
        pathname.includes("/device") ||
        pathname.includes("/variables") ||
        pathname.includes("/automations") ||
        pathname.includes("/tokens") ||
        pathname.includes("/users")
      ) {
        const firstDash = currentUser.accessibleDashboards?.[0];
        if (firstDash) {
          navigate(`/p/${firstDash.projectId}/dashboards/${firstDash.id}`, { replace: true });
        } else if (currentUser.projects?.[0]) {
          navigate(`/p/${currentUser.projects[0].id}/dashboards`, { replace: true });
        }
      }
    }
  }, [currentUser, pathname]);

  const handleSelectProject = (id: string) => {
    setSelectedProjectId(id);
    if (urlProjectId) {
      const segments = pathname.split("/").filter(Boolean);
      // segments: ["p", "<oldProj>", "<section>", ...]
      const section = segments[2] || "dashboards";
      // Route to the section root in the selected project (e.g. /p/ii/dashboards, /p/ii/device, /p/ii/variables, etc.)
      navigate(`/p/${id}/${section}`);
    } else {
      navigate(`/p/${id}/dashboards`);
    }
  };

  const handleSignOut = async () => {
    await clearClientSessionAndRedirect("/login");
  };

  return (
    <ShellContext.Provider
      value={{
        currentUser,
        isClient,
        projects,
        currentProjectId,
        setCurrentProjectId: handleSelectProject,
        refreshProjects: fetchProjects,
        refreshUser: async () => {
          await fetchUser();
        },
        signOut: handleSignOut,
        sidebarCollapsed,
        setSidebarCollapsed,
        toggleSidebar,
        mobileMenuOpen,
        setMobileMenuOpen,
        toggleMobileMenu,
        closeMobileMenu,
        breadcrumbTitle,
        setBreadcrumbTitle,
      }}
    >
      {children}
    </ShellContext.Provider>
  );
}

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used within ShellProvider");
  return ctx;
}
