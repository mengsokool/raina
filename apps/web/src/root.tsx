import React from "react";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
} from "react-router";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

export function meta() {
  return [
    { title: "raina — IoT Platform OS" },
    { name: "description", content: "Modern open-source IoT Dashboard Builder & Smart Farm OS" },
    { name: "color-scheme", content: "dark light" },
    { name: "theme-color", content: "#0a0a0a" },
  ];
}

export function links() {
  return [
    { rel: "icon", href: "/favicon.ico", sizes: "any" },
    { rel: "icon", href: "/favicon.png", type: "image/png" },
    { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
  ];
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="bg-background text-foreground antialiased h-full overflow-hidden">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: { error: unknown }) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto text-foreground">
      <h1 className="text-2xl font-bold text-destructive">{message}</h1>
      <p className="mt-2 text-muted-foreground">{details}</p>
      {stack && (
        <pre className="w-full p-4 mt-4 bg-card border border-border rounded-lg overflow-x-auto text-xs font-mono text-card-foreground">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
