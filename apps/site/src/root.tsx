import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
} from "react-router";
import type { Route } from "./+types/root";
import spaceGroteskLatin from "@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2?url";
import "./globals.css";

export const links: Route.LinksFunction = () => [
  { rel: "preload", as: "font", type: "font/woff2", href: spaceGroteskLatin, crossOrigin: "anonymous" },
  { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
  { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
  { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
];

export function meta(): Route.MetaDescriptors {
  return [
    { title: "Raina | Self-hosted IoT platform" },
    {
      name: "description",
      content:
        "Connect ESP32 devices over RLP, see telemetry live, automate responses, and run the stack on your own server.",
    },
  ];
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen bg-background text-foreground selection:bg-primary/20 selection:text-primary">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-background text-foreground">
      <div className="p-6 rounded-sm border border-border bg-card max-w-lg w-full text-left">
        <div className="flex items-center gap-2 mb-3">
          <img src="/raina-mark-128.png" alt="Raina" className="size-4.5" />
          <span className="font-bold text-xs tracking-tight text-foreground">raina</span>
          <span className="ml-auto text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-xs bg-destructive/10 text-destructive border border-destructive/20 font-semibold">
            {message}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-4">{details}</p>
        {stack && (
          <pre className="bg-[#0d0f0a] p-3 rounded-sm border border-border text-[11px] font-mono text-destructive overflow-auto max-h-60 mb-4">
            {stack}
          </pre>
        )}
        <a
          href="/"
          className="inline-flex items-center justify-center h-7.5 px-3 rounded-sm bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 transition-colors"
        >
          Back to Home
        </a>
      </div>
    </main>
  );
}
