"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { Check, ChevronDown, Globe, MapPin, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TimezoneOption {
  id: string; // e.g. "Asia/Bangkok"
  city: string; // e.g. "Bangkok"
  region: string; // e.g. "Asia"
  offset: string; // e.g. "UTC+7"
  searchKey: string;
}

function computeOffset(tz: string): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    });
    const parts = formatter.formatToParts(new Date());
    const offset = parts.find((p) => p.type === "timeZoneName")?.value || "";
    return offset.replace("GMT", "UTC");
  } catch {
    return "UTC";
  }
}

// Generate the list of supported IANA timezones
function getAllTimezones(): TimezoneOption[] {
  let list: string[] = [];
  try {
    if (typeof Intl !== "undefined" && typeof (Intl as any).supportedValuesOf === "function") {
      list = (Intl as any).supportedValuesOf("timeZone");
    }
  } catch {
    // fallback if supportedValuesOf is not available
  }

  if (list.length === 0) {
    list = [
      "UTC",
      "Asia/Bangkok",
      "Asia/Singapore",
      "Asia/Tokyo",
      "Asia/Hong_Kong",
      "Asia/Jakarta",
      "Asia/Seoul",
      "Asia/Dubai",
      "Europe/London",
      "Europe/Paris",
      "Europe/Berlin",
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "Australia/Sydney",
    ];
  }

  // Ensure UTC is at the very beginning if present
  const result: TimezoneOption[] = [];
  const set = new Set<string>();

  const processTz = (tz: string) => {
    if (set.has(tz)) return;
    set.add(tz);

    const parts = tz.split("/");
    const city = (parts[parts.length - 1] || tz).replace(/_/g, " ");
    const region = parts.length > 1 ? parts.slice(0, -1).join("/") : "General";
    const offset = computeOffset(tz);

    result.push({
      id: tz,
      city,
      region,
      offset,
      searchKey: `${tz} ${city} ${region} ${offset}`.toLowerCase(),
    });
  };

  processTz("UTC");
  for (const tz of list) {
    processTz(tz);
  }

  return result;
}

export function TimezoneSelect({
  value,
  onChange,
  error,
  testId = "inspector-input-tz",
}: {
  value: string;
  onChange: (tz: string) => void;
  error?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const localTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }, []);

  const localOffset = useMemo(() => computeOffset(localTimezone), [localTimezone]);

  const allTimezones = useMemo(() => getAllTimezones(), []);

  const activeTimezone = value || localTimezone;
  const activeOffset = useMemo(() => computeOffset(activeTimezone), [activeTimezone]);

  // Filter timezones based on query
  const filtered = useMemo(() => {
    if (!query.trim()) {
      return allTimezones;
    }
    const q = query.trim().toLowerCase();
    return allTimezones.filter((t) => t.searchKey.includes(q));
  }, [allTimezones, query]);

  // Focus search input when popover opens
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setQuery("");
    }
  }, [open]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleSelect = (tzId: string) => {
    onChange(tzId);
    setOpen(false);
  };

  return (
    <div className="relative w-full" ref={popoverRef}>
      {/* Trigger Button */}
      <button
        type="button"
        data-testid={testId}
        onClick={() => setOpen((prev) => !prev)}
        className={`mt-1.5 flex h-9 w-full items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-xs transition select-none cursor-pointer text-left focus:outline-none focus:ring-1 focus:ring-ring ${
          error
            ? "border-destructive text-destructive"
            : "border-input hover:border-foreground/50 text-foreground"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Globe className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate font-mono font-medium">
            {activeTimezone}
          </span>
          <span className="shrink-0 rounded-xs bg-muted px-1.5 py-0.2 text-[10px] font-mono text-muted-foreground">
            {activeOffset}
          </span>
        </div>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-150" />
      </button>

      {/* Floating Search Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-72 rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl animate-in fade-in-0 zoom-in-95 duration-100">
          {/* Search Header */}
          <div className="flex items-center gap-2 border-b border-border p-2">
            <Search className="size-3.5 shrink-0 text-muted-foreground ml-1" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search city, country or timezone..."
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="rounded-xs p-1 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          {/* Quick detect current local timezone button */}
          <div className="border-b border-border p-1 bg-muted/40">
            <button
              type="button"
              onClick={() => handleSelect(localTimezone)}
              className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs text-foreground transition hover:bg-muted cursor-pointer"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <MapPin className="size-3 text-primary shrink-0" />
                <span className="text-[11px] font-medium text-muted-foreground">Your local time:</span>
                <span className="font-mono font-semibold text-foreground truncate">{localTimezone}</span>
              </div>
              <span className="shrink-0 text-[10px] font-mono font-medium text-primary bg-primary/10 px-1 py-0.2 rounded-xs">
                {localOffset}
              </span>
            </button>
          </div>

          {/* Timezone List */}
          <div className="max-h-60 overflow-y-auto overscroll-contain p-1">
            {filtered.length > 0 ? (
              filtered.map((tz) => {
                const isSelected = activeTimezone === tz.id;
                return (
                  <button
                    key={tz.id}
                    type="button"
                    data-testid={`timezone-option-${tz.id}`}
                    onClick={() => handleSelect(tz.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs transition cursor-pointer text-left ${
                      isSelected
                        ? "bg-primary/15 font-semibold text-primary"
                        : "text-foreground hover:bg-muted"
                    }`}
                  >
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="font-medium truncate">{tz.city}</span>
                      <span className="text-[11px] font-mono text-muted-foreground truncate">
                        {tz.id}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="rounded-xs bg-muted px-1.5 py-0.2 text-[10px] font-mono text-muted-foreground">
                        {tz.offset}
                      </span>
                      {isSelected && <Check className="size-3.5 text-primary" />}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="p-3 text-center text-xs text-muted-foreground">
                <p>No timezone found for &ldquo;{query}&rdquo;</p>
                <button
                  type="button"
                  onClick={() => handleSelect(query.trim())}
                  className="mt-2 text-primary font-medium underline text-xs cursor-pointer"
                >
                  Use &ldquo;{query.trim()}&rdquo; as custom timezone
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
