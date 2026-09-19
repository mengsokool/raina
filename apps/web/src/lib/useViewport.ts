"use client";

import { useState, useEffect } from "react";

const PHONE_QUERY = "(max-width: 767px)";
const MOBILE_QUERY = "(max-width: 1023px)";

export function useMediaQuery(query: string, defaultValue = false): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      try {
        return window.matchMedia(query).matches;
      } catch {
        return defaultValue;
      }
    }
    return defaultValue;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    try {
      const mql = window.matchMedia(query);
      setMatches(mql.matches);

      const onChange = (e: MediaQueryListEvent) => {
        setMatches(e.matches);
      };

      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    } catch {
      // ignore
    }
  }, [query]);

  return matches;
}

export function useIsPhone(): boolean {
  return useMediaQuery(PHONE_QUERY, false);
}

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY, false);
}
