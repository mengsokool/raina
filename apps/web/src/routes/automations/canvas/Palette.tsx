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
        className="group relative z-30 hidden h-full w-12 cursor-pointer flex-col items-center border-r border-border bg-card py-4 select-none transition-colors hover:bg-accent lg:flex"
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
        <div className="rounded-lg p-2 text-muted-foreground group-hover:text-foreground transition">
          <PanelLeft className="size-4" />
        </div>
        <div className="mt-8 flex flex-1 items-center justify-center">
          <span
            className="text-xs font-semibold tracking-wider text-muted-foreground group-hover:text-foreground uppercase whitespace-nowrap transition-colors rotate-180 writing-mode-vertical"
          >
            Blocks
          </span>
        </div>
      </aside>
    );
  }

  const onDragStart = (e: React.DragEvent, kind: string) => {
    e.dataTransfer.setData("application/reactflow", kind);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-card border-r border-border select-none">
      {/* Top Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Blocks
        </span>
        <div className="flex items-center gap-1">
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="hidden rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground lg:block transition"
              aria-label="Collapse block catalog"
              title="Collapse block catalog"
            >
              <PanelLeftClose className="size-4" />
            </button>
          )}
          <button
            onClick={close}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden transition"
            aria-label="Close block palette"
          >
            <PanelLeftClose className="size-4" />
          </button>
        </div>
      </div>

      {/* Grid of Blocks */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-6">
        {sections.map((section) => (
          <div key={section.key}>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {section.title}
            </h3>

            <div className="grid grid-cols-3 gap-2">
              {section.catalog.map((item) => (
                <button
                  key={item.kind}
                  data-testid={`palette-add-${item.kind}`}
                  type="button"
                  draggable
                  onDragStart={(e) => onDragStart(e, item.kind)}
                  onClick={() => add(item.kind)}
                  className="group flex flex-col items-center justify-center rounded-xl border border-border bg-muted/40 p-2.5 transition hover:border-foreground/40 hover:bg-accent active:scale-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring aspect-square text-center cursor-grab active:cursor-grabbing touch-manipulation select-none"
                  title={item.description}
                >
                  <div className="text-muted-foreground transition group-hover:text-foreground group-hover:scale-110">
                    <BlockIcon kind={item.kind} className="size-5" />
                  </div>
                  <span className="mt-2 block w-full truncate text-xs font-medium text-foreground transition group-hover:text-foreground">
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
      >
        <div className="flex h-full max-h-3/4 flex-col overflow-hidden">
          <DrawerHeader className="shrink-0">
            <div className="flex items-center justify-between">
              <DrawerTitle>
                Add block
              </DrawerTitle>
              <DrawerClose asChild>
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Close palette drawer"
                >
                  <X className="size-4" />
                </button>
              </DrawerClose>
            </div>
            <DrawerDescription>
              Select a trigger, condition, or action to insert into your flow.
            </DrawerDescription>
          </DrawerHeader>

          <div
            data-vaul-no-drag
            className="flex-1 overflow-y-auto overscroll-contain p-4 pb-8 space-y-6"
          >
            {sections.map((section) => (
              <div key={section.key}>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
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
                      className="group flex flex-col items-center justify-center rounded-xl border border-border bg-muted/40 p-3 transition hover:border-foreground/40 hover:bg-accent active:scale-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring aspect-square text-center"
                      title={item.description}
                    >
                      <div className="text-muted-foreground transition group-hover:text-foreground group-hover:scale-110">
                        <BlockIcon kind={item.kind} className="size-6" />
                      </div>
                      <span className="mt-2 block w-full truncate text-xs font-medium text-foreground transition group-hover:text-foreground">
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

