"use client";

import React, { useState } from "react";
import { widgets } from "../widgets";
import { WidgetInstance } from "@/types";
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
      {/* Mobile drawer backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-neutral-200 bg-white transition-transform duration-200 lg:static lg:z-auto lg:shrink-0 lg:translate-x-0 lg:transition-none dark:border-neutral-800 dark:bg-neutral-900 ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex h-12 items-center justify-between border-b border-neutral-200 px-3 py-2.5 dark:border-neutral-800">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Widgets
          </span>
          <button
            type="button"
            className="rounded-xs p-1 text-neutral-500 hover:bg-neutral-100 lg:hidden dark:text-neutral-400 dark:hover:bg-neutral-800"
            aria-label="Close widgets"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-2">
          {groups.map((g) => (
            <section key={g.category}>
              <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500 font-mono">
                {g.category}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {g.items.map((w: any) => (
                  <button
                    key={w.id}
                    type="button"
                    className="group flex aspect-square flex-col items-center justify-center gap-1 rounded-xs border border-neutral-200 bg-white text-neutral-600 transition hover:border-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300 dark:hover:border-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                    onClick={() => onAdd(w.id)}
                    onMouseEnter={(e) => handleMouseEnter(w, e)}
                    onMouseLeave={handleMouseLeave}
                  >
                    <span
                      className="h-7 w-7 flex items-center justify-center [&>svg]:w-6 [&>svg]:h-6"
                      dangerouslySetInnerHTML={{ __html: w.icon }}
                    />
                    <span className="text-[11px] font-medium leading-none">{w.label}</span>
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
          className="pointer-events-none fixed z-50 w-72 rounded-sm border border-neutral-200 bg-white p-3.5 shadow-xl dark:border-neutral-800 dark:bg-neutral-900 animate-in fade-in duration-100"
          style={{ top: `${tipPos.top}px`, left: `${tipPos.left}px` }}
        >
          <div className="flex items-center gap-2">
            <span
              className="h-4.5 w-4.5 text-neutral-900 dark:text-neutral-100 [&>svg]:w-4.5 [&>svg]:h-4.5"
              dangerouslySetInnerHTML={{ __html: hovered.icon }}
            />
            <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
              {hovered.label}
            </div>
          </div>
          <p className="mt-1.5 text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
            {hovered.description}
          </p>
          <div className="mt-2 text-[10px] font-mono text-neutral-400">
            Size: {hovered.defaultSize?.w || 4}x{hovered.defaultSize?.h || 2} cols
          </div>
        </div>
      )}
    </>
  );
}
