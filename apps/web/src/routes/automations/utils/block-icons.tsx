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
      badgeBg: "bg-info/10",
      badgeBorder: "border-info/30",
      badgeIcon: "text-info",
      accentBorder: "border-info",
    };
  }

  if (category === "condition") {
    return {
      badgeBg: "bg-chart-4/10",
      badgeBorder: "border-chart-4/30",
      badgeIcon: "text-chart-4",
      accentBorder: "border-chart-4",
    };
  }

  if (category === "action") {
    return {
      badgeBg: "bg-primary/10",
      badgeBorder: "border-primary/30",
      badgeIcon: "text-primary",
      accentBorder: "border-primary",
    };
  }

  return {
    badgeBg: "bg-muted",
    badgeBorder: "border-border",
    badgeIcon: "text-muted-foreground",
    accentBorder: "border-border",
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
