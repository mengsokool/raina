import React from "react";
import { PanelLeftClose, PanelLeft, X } from "lucide-react";
import { blocks } from "@raina/workflow";
import { BlockIcon } from "../utils/block-icons";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
} from "@/components/ui/drawer";

const sections = [
  {
    key: "triggers",
    title: "TRIGGERS",
    catalog: blocks.TRIGGER_CATALOG,
  },
  {
    key: "conditions",
    title: "CONDITIONS",
    catalog: blocks.CONDITION_CATALOG,
  },
  {
    key: "actions",
    title: "ACTIONS",
    catalog: blocks.ACTION_CATALOG,
  },
] as const;

type PaletteProps = {
  query: string;
  setQuery: (val: string) => void;
  add: (kind: string) => void;
  close: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
};

export function Palette({
  add,
  close,
  isCollapsed = false,
  onToggleCollapse,
}: PaletteProps) {
  if (isCollapsed) {
    return (
      <aside
        data-testid="palette-panel-collapsed"
        onClick={onToggleCollapse}
        className="group relative z-30 hidden h-full w-12 cursor-pointer flex-col items-center border-r border-neutral-200 bg-white py-4 select-none transition-colors hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-900 lg:flex"
        title="Expand block catalog"
        aria-label="Expand block catalog"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleCollapse?.();
          }
        }}
      >
        <div className="rounded-lg p-2 text-neutral-500 group-hover:text-neutral-950 dark:text-neutral-400 dark:group-hover:text-white transition">
          <PanelLeft className="h-4 w-4" />
        </div>
        <div className="mt-8 flex flex-1 items-center justify-center">
          <span
            className="text-xs font-semibold tracking-wider text-neutral-500 group-hover:text-neutral-900 dark:text-neutral-400 dark:group-hover:text-neutral-200 uppercase whitespace-nowrap transition-colors"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            Blocks
          </span>
        </div>
      </aside>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-white border-r border-neutral-200 select-none dark:bg-neutral-950 dark:border-neutral-800">
      {/* Top Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 px-4 dark:border-neutral-800">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
          Blocks
        </span>
        <div className="flex items-center gap-1">
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="hidden rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-white lg:block transition"
              aria-label="Collapse block catalog"
              title="Collapse block catalog"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={close}
            className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-white lg:hidden transition"
            aria-label="Close block palette"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Grid of Blocks */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-6">
        {sections.map((section) => (
          <div key={section.key}>
            <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
              {section.title}
            </h3>

            <div className="grid grid-cols-3 gap-2">
              {section.catalog.map((item) => (
                <button
                  key={item.kind}
                  data-testid={`palette-add-${item.kind}`}
                  type="button"
                  onClick={() => add(item.kind)}
                  className="group flex flex-col items-center justify-center rounded-xl border border-neutral-200/80 bg-neutral-50/70 p-2.5 transition hover:border-neutral-300 hover:bg-neutral-100 active:scale-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lime-500 dark:border-neutral-800/90 dark:bg-neutral-900/60 dark:hover:border-neutral-700 dark:hover:bg-neutral-800/80 aspect-square text-center"
                  title={item.description}
                >
                  <div className="text-neutral-500 transition group-hover:text-neutral-950 group-hover:scale-110 dark:text-neutral-400 dark:group-hover:text-white">
                    <BlockIcon kind={item.kind} className="h-5 w-5" />
                  </div>
                  <span className="mt-2 block w-full truncate text-[11px] font-medium text-neutral-700 transition group-hover:text-neutral-950 dark:text-neutral-400 dark:group-hover:text-neutral-200">
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PaletteDrawer({
  open,
  onOpenChange,
  add,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  add: (kind: string) => void;
}) {
  return (
    <Drawer
      modal={false}
      open={open}
      onOpenChange={onOpenChange}
    >
      <DrawerContent
        hideOverlay
        data-testid="palette-mobile-drawer"
        className="fixed bottom-0 left-0 right-0 max-h-[75vh] rounded-t-[16px] bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 flex flex-col focus:outline-none pointer-events-auto"
      >
        <div className="flex h-full max-h-[75vh] flex-col overflow-hidden">
          <DrawerHeader className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800 shrink-0">
            <div className="flex items-center justify-between">
              <DrawerTitle className="text-sm font-semibold text-neutral-900 dark:text-white">
                Add block
              </DrawerTitle>
              <DrawerClose asChild>
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
                  aria-label="Close palette drawer"
                >
                  <X className="h-4 w-4" />
                </button>
              </DrawerClose>
            </div>
            <DrawerDescription className="text-left text-xs text-neutral-500 dark:text-neutral-400">
              Select a trigger, condition, or action to insert into your flow.
            </DrawerDescription>
          </DrawerHeader>

          <div
            data-vaul-no-drag
            className="flex-1 overflow-y-auto overscroll-contain p-4 pb-8 space-y-6"
          >
            {sections.map((section) => (
              <div key={section.key}>
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                  {section.title}
                </h3>

                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                  {section.catalog.map((item) => (
                    <button
                      key={item.kind}
                      data-testid={`palette-drawer-add-${item.kind}`}
                      type="button"
                      onClick={() => {
                        add(item.kind);
                        onOpenChange(false);
                      }}
                      className="group flex flex-col items-center justify-center rounded-xl border border-neutral-200/80 bg-neutral-50/70 p-3 transition hover:border-neutral-300 hover:bg-neutral-100 active:scale-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lime-500 dark:border-neutral-800/90 dark:bg-neutral-900/60 dark:hover:border-neutral-700 dark:hover:bg-neutral-800/80 aspect-square text-center"
                      title={item.description}
                    >
                      <div className="text-neutral-500 transition group-hover:text-neutral-950 group-hover:scale-110 dark:text-neutral-400 dark:group-hover:text-white">
                        <BlockIcon kind={item.kind} className="h-6 w-6" />
                      </div>
                      <span className="mt-2 block w-full truncate text-[11px] font-medium text-neutral-700 transition group-hover:text-neutral-950 dark:text-neutral-400 dark:group-hover:text-neutral-200">
                        {item.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

