import React from "react";
import { blocks } from "@raina/workflow";

type BlockIconProps = {
  kind: string;
  className?: string;
};

export function getBlockTheme(kind: string) {
  const block = blocks.findBlock(kind);
  const category = block?.category;

  if (category === "trigger") {
    return {
      badgeBg: "bg-sky-500/10 dark:bg-sky-500/15",
      badgeBorder: "border-sky-500/25 dark:border-sky-500/35",
      badgeIcon: "text-sky-600 dark:text-sky-400",
      accentBorder: "border-sky-500",
    };
  }

  if (category === "condition") {
    return {
      badgeBg: "bg-violet-500/10 dark:bg-violet-500/15",
      badgeBorder: "border-violet-500/25 dark:border-violet-500/35",
      badgeIcon: "text-violet-600 dark:text-violet-400",
      accentBorder: "border-violet-500",
    };
  }

  if (category === "action") {
    return {
      badgeBg: "bg-emerald-500/10 dark:bg-emerald-500/15",
      badgeBorder: "border-emerald-500/25 dark:border-emerald-500/35",
      badgeIcon: "text-emerald-600 dark:text-emerald-400",
      accentBorder: "border-emerald-500",
    };
  }

  return {
    badgeBg: "bg-neutral-100 dark:bg-neutral-800",
    badgeBorder: "border-neutral-200 dark:border-neutral-700",
    badgeIcon: "text-neutral-700 dark:text-neutral-300",
    accentBorder: "border-neutral-500",
  };
}

export function BlockIcon({ kind, className = "h-4 w-4" }: BlockIconProps) {
  const icon = blocks.findBlock(kind)?.icon;
  if (!icon) return <span className={className} aria-hidden="true">?</span>;

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={icon} />
    </svg>
  );
}
