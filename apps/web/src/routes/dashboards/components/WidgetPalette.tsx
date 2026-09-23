"use client";

import React, { useState } from "react";
import { widgets } from "../widgets";
import { X } from "lucide-react";

type WidgetCategory = "Monitor" | "Control";
const CATEGORY_ORDER: WidgetCategory[] = ["Monitor", "Control"];

export function WidgetPalette({
  open = false,
  onClose,
  onAdd,
}: {
  open?: boolean;
  onClose: () => void;
  onAdd: (manifestId: string) => void;
}) {
  const [hovered, setHovered] = useState<any | null>(null);
  const [tipPos, setTipPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  if (!open) return null;

  const catalog = widgets.CATALOG;

  const groups = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    items: catalog.filter((w: any) => w.category === cat),
  })).filter((g) => g.items.length > 0);

  const handleMouseEnter = (item: any, e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTipPos({ top: rect.top, left: rect.right + 10 });
    setHovered(item);
  };

  const handleMouseLeave = () => {
    setHovered(null);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 animate-in fade-in duration-150"
        onClick={onClose}
      />

      {/* Slide-out Drawer */}
      <aside className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-card shadow-2xl animate-in slide-in-from-left duration-200">
        <div className="flex h-12 items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
            Add Widget
          </span>
          <button
            type="button"
            className="rounded-xs p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            aria-label="Close widgets"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-3">
          {groups.map((g) => (
            <section key={g.category}>
              <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground font-mono">
                {g.category}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {g.items.map((w: any) => (
                  <button
                    key={w.id}
                    type="button"
                    className="group flex aspect-square flex-col items-center justify-center gap-1 rounded-sm border border-border bg-card text-muted-foreground transition hover:border-primary hover:bg-muted hover:text-foreground cursor-pointer"
                    onClick={() => onAdd(w.id)}
                    onMouseEnter={(e) => handleMouseEnter(w, e)}
                    onMouseLeave={handleMouseLeave}
                  >
                    <span
                      className="size-7 flex items-center justify-center [&>svg]:size-6"
                      dangerouslySetInnerHTML={{ __html: w.icon }}
                    />
                    <span className="text-xs font-medium leading-none text-center px-1">{w.label}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </aside>

      {/* Hover tooltip */}
      {hovered && (
        <div
          className="pointer-events-none fixed z-60 w-72 rounded-sm border border-border bg-popover text-popover-foreground p-3.5 shadow-xl animate-in fade-in duration-100"
          style={{ top: `${tipPos.top}px`, left: `${tipPos.left}px` }}
        >
          <div className="flex items-center gap-2">
            <span
              className="size-4.5 text-foreground [&>svg]:size-4.5"
              dangerouslySetInnerHTML={{ __html: hovered.icon }}
            />
            <div className="text-xs font-semibold text-foreground">
              {hovered.label}
            </div>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
            {hovered.description}
          </p>
          <div className="mt-2 text-xs font-mono text-muted-foreground">
            Size: {hovered.defaultSize?.w || 4}x{hovered.defaultSize?.h || 2} cols
          </div>
        </div>
      )}
    </>
  );
}
