"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";

function ThemeColorSync() {
  const { resolvedTheme } = useTheme();

  React.useEffect(() => {
    const isDark = resolvedTheme === "dark";
    const color = isDark ? "#0a0a0a" : "#fafafa";
    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = color;
  }, [resolvedTheme]);

  return null;
}

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider {...props}>
      <ThemeColorSync />
      {children}
    </NextThemesProvider>
  );
}
