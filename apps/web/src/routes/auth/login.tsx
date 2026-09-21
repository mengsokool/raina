import React, { useState } from "react";
import { redirect, useLoaderData, useNavigate, useSearchParams } from "react-router";
import { getBootstrapStatus } from "@/lib/api-client";
import { getServerUser } from "@/lib/server-loaders";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function getSafeRedirectUrl(target: string | null): string {
  if (!target) return "/projects";
  const clean = target.replace(/\.data$/, "");
  if (!clean.startsWith("/") || clean.startsWith("//") || clean.startsWith("/login")) {
    return "/projects";
  }
  return clean;
}

export function meta() {
  return [
    { title: "Sign in — raina" },
    { name: "description", content: "Sign in to raina IoT platform" },
  ];
}

export async function loader({ request }: { request: Request }) {
  const user = await getServerUser(request);
  if (user) {
    const url = new URL(request.url);
    throw redirect(getSafeRedirectUrl(url.searchParams.get("from")));
  }

  try {
    return { ...(await getBootstrapStatus()), unavailable: false };
  } catch {
    return { bootstrap: false, requiresSetupToken: false, unavailable: true };
  }
}

export function LoginForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { bootstrap, requiresSetupToken } = useLoaderData<typeof loader>();
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password || (bootstrap && (!email.trim() || (requiresSetupToken && !setupToken)))) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(bootstrap
          ? { bootstrap: true, username: identifier.trim(), email: email.trim(), password, setupToken }
          : { identifier: identifier.trim(), password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Invalid username or password");
      const me = result.user;
      if (me) {
        if (me.role === "client") {
          const firstDash = me.accessibleDashboards?.[0];
          if (firstDash) {
            navigate(`/p/${firstDash.projectId}/dashboards/${firstDash.id}`);
            return;
          }
          if (me.projects?.[0]) {
            navigate(`/p/${me.projects[0].id}/dashboards`);
            return;
          }
        }
        navigate(getSafeRedirectUrl(searchParams.get("from")));
      }
    } catch (err: any) {
      setError(err.message || "Invalid username or password");
    } finally {
      setLoading(false);
    }
  };

  const labelClass = "block text-sm font-medium text-foreground";

  return (
    <>
      {error && (
        <div role="alert" className="mb-5 border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        {bootstrap && requiresSetupToken && (
          <div className="space-y-2">
            <label htmlFor="setup-token" className={labelClass}>Setup token</label>
            <Input id="setup-token" type="password" autoComplete="off" required size="lg" value={setupToken} onChange={(e) => setSetupToken(e.target.value)} placeholder="••••••••" />
          </div>
        )}

        {bootstrap && (
          <div className="space-y-2">
            <label htmlFor="owner-email" className={labelClass}>Email</label>
            <Input id="owner-email" type="email" autoComplete="email" required size="lg" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="owner-identifier" className={labelClass}>{bootstrap ? "Owner username" : "Username or Email"}</label>
          <Input id="owner-identifier" type="text" required autoFocus autoComplete="username" size="lg" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder={bootstrap ? "Choose a username" : "name@company.com"} />
        </div>

        <div className="space-y-2">
          <label htmlFor="owner-password" className={labelClass}>Password</label>
          <Input id="owner-password" type="password" required minLength={bootstrap ? 8 : undefined} autoComplete={bootstrap ? "new-password" : "current-password"} size="lg" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>

        <Button type="submit" size="lg" disabled={loading} className="mt-3 w-full">
          {loading ? (bootstrap ? "Creating account..." : "Signing in...") : (bootstrap ? "Create owner account" : "Continue to Raina")}
        </Button>
      </form>
    </>
  );
}

function RainaMark({ inverse = false }: { inverse?: boolean }) {
  return (
    <div className={`flex size-10 items-center justify-center ${inverse ? "bg-white/5" : "bg-foreground text-background"}`}>
      <img src="/raina-mark-128.png" width="28" height="28" alt="" className="size-7 object-contain" />
    </div>
  );
}

function GrowthArtwork() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 600 300" fill="none" className="mt-auto block w-full shrink-0">
      {/* Oversized leaf modules echo the mark without enlarging the raster asset. */}
      <path d="M0 0C166 0 300 134 300 300C134 300 0 166 0 0Z" fill="var(--color-accent-400, #a3e635)" />
      <path d="M300 300C300 134 434 0 600 0C600 166 466 300 300 300Z" fill="var(--color-accent-200, #d9f99d)" />
      <path d="M0 0 300 300 600 0" stroke="currentColor" strokeWidth="1.5" className="text-foreground" />
      <circle cx="510" cy="210" r="32" fill="var(--color-primary, #32c638)" />
    </svg>
  );
}

export default function LoginPage() {
  const { bootstrap, unavailable } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-2">
        <aside className="relative hidden overflow-hidden bg-card text-card-foreground lg:flex lg:flex-col" aria-label="Raina platform introduction">
          <div className="flex items-center gap-3 px-10 pt-10 xl:px-14">
            <RainaMark inverse />
            <span className="text-lg font-semibold tracking-tight">raina</span>
          </div>

          <p className="my-auto px-10 py-12 text-6xl font-semibold leading-none tracking-tight text-foreground xl:px-14 xl:text-8xl">
            Grow with<br /><span className="text-primary">clarity.</span>
          </p>

          <GrowthArtwork />
        </aside>

        <main className="flex min-h-screen items-center justify-center px-6 py-12 sm:px-10 lg:px-16">
          <div className="w-full max-w-lg">
            <div className="mb-10 flex items-center gap-3 lg:hidden">
              <RainaMark />
              <span className="text-lg font-semibold tracking-tight">raina</span>
            </div>

            <div className="mb-9">
              <h1 className="text-balance text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">{bootstrap ? "Set up your Raina workspace" : "Welcome back."}</h1>
            </div>

            {unavailable ? (
              <div role="alert" className="border border-destructive/20 bg-destructive/10 p-4 text-sm leading-6 text-destructive">
                <p className="font-semibold">Raina is not ready yet.</p>
                <p className="mt-1">Check the API server logs, then reload this page.</p>
                <a href="/login" className="mt-3 inline-flex font-semibold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Reload page</a>
              </div>
            ) : <LoginForm />}
          </div>
        </main>
      </div>
    </div>
  );
}
