"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="h-7 w-7 text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 rounded-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
        aria-label="Toggle theme"
      >
        <Sun className="h-3.5 w-3.5 opacity-50" />
      </Button>
    );
  }

  const isDark = (resolvedTheme || theme) === "dark";

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      onClick={toggleTheme}
      className="h-7 w-7 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 rounded-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 ring-0 outline-none"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle theme"
    >
      {isDark ? (
        <Sun className="h-3.5 w-3.5 transition-transform hover:rotate-45" />
      ) : (
        <Moon className="h-3.5 w-3.5 transition-transform hover:-rotate-12" />
      )}
    </Button>
  );
}
