import React, { useState } from "react";
import { redirect, useLoaderData, useNavigate } from "react-router";
import { bootstrapOwner, getBootstrapStatus, getCurrentUser, signIn } from "@/lib/api-client";
import { getServerUser } from "@/lib/server-loaders";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function meta() {
  return [
    { title: "Sign in — raina" },
    { name: "description", content: "Sign in to raina IoT platform" },
  ];
}

export async function loader({ request }: { request: Request }) {
  const user = await getServerUser(request);
  if (user) {
    throw redirect("/projects");
  }
  try {
    return { ...(await getBootstrapStatus()), unavailable: false };
  } catch {
    return { bootstrap: false, requiresSetupToken: false, unavailable: true };
  }
}

export function LoginForm() {
  const navigate = useNavigate();
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
      const res = bootstrap
        ? await bootstrapOwner({ username: identifier.trim(), email: email.trim(), password, setupToken })
        : await signIn({ identifier: identifier.trim(), password });

      if (res.token) {
        try {
          localStorage.removeItem("raina_token");
        } catch {}

        const me = await getCurrentUser();

        if (me.role === "client") {
          const firstDash = me.accessibleDashboards?.[0];
          if (firstDash) {
            navigate(`/p/${firstDash.projectId}/dashboards/${firstDash.id}`);
            return;
          } else if (me.projects?.[0]) {
            navigate(`/p/${me.projects[0].id}/dashboards`);
            return;
          }
        }
        navigate("/projects");
      }
    } catch (err: any) {
      setError(err.message || "Invalid username or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-2.5 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        {bootstrap && requiresSetupToken && (
          <div className="space-y-1.5">
            <label htmlFor="setup-token" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Setup token
            </label>
            <Input
              id="setup-token"
              type="password"
              autoComplete="off"
              required
              value={setupToken}
              onChange={(e) => setSetupToken(e.target.value)}
              placeholder="From .env.production"
              className="bg-neutral-50 dark:bg-neutral-950 h-11 text-sm"
            />
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Find SETUP_TOKEN in the private .env.production file on your server.</p>
          </div>
        )}
        {bootstrap && (
          <div className="space-y-1.5">
            <label htmlFor="owner-email" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Email
            </label>
            <Input
              id="owner-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="bg-neutral-50 dark:bg-neutral-950 h-11 text-sm"
            />
          </div>
        )}
        <div className="space-y-1.5">
          <label htmlFor="owner-identifier" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
            {bootstrap ? "Owner username" : "Username or Email"}
          </label>
          <Input
            id="owner-identifier"
            type="text"
            required
            autoFocus
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder={bootstrap ? "Choose a username" : "e.g. admin"}
            className="bg-neutral-50 dark:bg-neutral-950 h-11 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="owner-password" className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
            Password
          </label>
          <Input
            id="owner-password"
            type="password"
            required
            minLength={bootstrap ? 8 : undefined}
            autoComplete={bootstrap ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="bg-neutral-50 dark:bg-neutral-950 h-11 text-sm"
          />
          {bootstrap && <p className="text-xs text-neutral-500 dark:text-neutral-400">Use at least 8 characters.</p>}
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full mt-2 h-11 text-sm"
        >
          {loading ? (bootstrap ? "Creating account..." : "Signing in...") : (bootstrap ? "Create owner account" : "Sign in")}
        </Button>
      </form>
    </>
  );
}

export default function LoginPage() {
  const { bootstrap, unavailable } = useLoaderData<typeof loader>();
  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-6 dark:bg-neutral-900">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 font-bold text-xs">
              r
            </div>
            <span className="font-semibold tracking-tight text-neutral-900 dark:text-neutral-100 text-sm">
              raina
            </span>
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            {bootstrap ? "Set up Raina" : "Sign in"}
          </h1>
          {bootstrap && <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">Create the owner account to start using your server.</p>}
          {unavailable && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">The API is not ready. Check the server logs, then reload this page.</p>}
        </div>

        {unavailable ? <a href="/login" className="text-sm font-medium underline underline-offset-4">Reload page</a> : <LoginForm />}
      </div>
    </div>
  );
}
