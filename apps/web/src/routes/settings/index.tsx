import React from "react";
import { useLoaderData } from "react-router";
import { getServerUser, getServerDiagnostics } from "@/lib/server-loaders";
import { ProfileSection } from "./ProfileSection";
import { SecuritySection } from "./SecuritySection";
import { DiagnosticsSection } from "./DiagnosticsSection";
import { HardwareEndpointsSection } from "./HardwareEndpointsSection";

export function meta() {
  return [
    { title: "Settings — raina" },
    { name: "description", content: "Deployment-wide platform and user configuration" },
  ];
}

export async function loader({ request }: { request: Request }) {
  const [initialUser, initialDiagnostics] = await Promise.all([
    getServerUser(request),
    getServerDiagnostics(request),
  ]);

  return { initialUser, initialDiagnostics };
}

export default function SettingsPage() {
  const { initialUser, initialDiagnostics } = useLoaderData<typeof loader>();
  return (
    <div className="mx-auto max-w-4xl px-2 py-3 sm:px-5 sm:py-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          Settings
        </h1>
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
          Manage your user account credentials, security, and hardware connection endpoints.
        </p>
      </header>

      {/* 1. User Account & Profile */}
      <ProfileSection initialUser={initialUser} />

      {/* 2. Security & Password Management */}
      <SecuritySection />

      {/* 3. Live Hardware Connection Endpoints */}
      <HardwareEndpointsSection initialEndpoints={initialDiagnostics?.endpoints} />

      {/* 4. Live Service Status (Staff / Admin only, when available) */}
      {initialDiagnostics && <DiagnosticsSection initialDiagnostics={initialDiagnostics} />}
    </div>
  );
}
