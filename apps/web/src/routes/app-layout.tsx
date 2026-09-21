import React from "react";
import { Outlet, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/app-layout";
import { ShellProvider } from "@/components/ShellContext";
import { AppShellLayout } from "@/components/AppShellLayout";
import { getServerUser, getServerProjects } from "@/lib/server-loaders";
import { clearSessionCookie, getBffSessionToken } from "@/lib/bff-session.server";

export async function loader({ request }: Route.LoaderArgs) {
  const cookie = request.headers.get("cookie") || "";
  const token = getBffSessionToken(cookie);
  if (!token) {
    const url = new URL(request.url);
    const cleanPath = url.pathname.replace(/\.data$/, "");
    const from = cleanPath && cleanPath !== "/" && cleanPath !== "/login" ? `?from=${encodeURIComponent(cleanPath)}` : "";
    throw redirect(`/login${from}`);
  }

  const isCollapsed = cookie.includes("raina_sidebar_collapsed=true");
  const [initialUser, initialProjects] = await Promise.all([
    getServerUser(request),
    getServerProjects(request),
  ]);

  if (!initialUser) {
    const headers = new Headers();
    headers.append("Set-Cookie", clearSessionCookie(request));
    throw redirect("/login", { headers });
  }

  return {
    initialSidebarCollapsed: isCollapsed,
    initialUser,
    initialProjects,
  };
}

export default function AppLayout() {
  const { initialSidebarCollapsed, initialUser, initialProjects } = useLoaderData<typeof loader>();

  return (
    <ShellProvider
      initialSidebarCollapsed={initialSidebarCollapsed}
      initialUser={initialUser}
      initialProjects={initialProjects}
    >
      <AppShellLayout>
        <Outlet />
      </AppShellLayout>
    </ShellProvider>
  );
}
