"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import GridLayout, { Layout } from "react-grid-layout";
import { WidgetInstance, Layout as LayoutType } from "@/types";
import { WidgetDispatcher, widgets } from "../widgets";
import { effectiveMobileLayout } from "./mobile-layout";

interface DashboardGridProps {
  layout: LayoutType;
  isEditing: boolean;
  selectedId: string | null;
  onSelectWidget: (item: WidgetInstance | null) => void;
  onLayoutChange: (newLayout: LayoutType) => void;
  onRemoveWidget: (id: string) => void;
  variableValues?: Record<string, any>;
  seriesMap?: Record<string, { t: number[]; v: number[] }>;
  onControl?: (key: string, val: any) => Promise<void> | void;
}

interface GridCellProps {
  item: WidgetInstance;
  isEditing: boolean;
  isSelected: boolean;
  onSelectWidget: (item: WidgetInstance | null) => void;
  variableValues?: Record<string, any>;
  seriesMap?: Record<string, { t: number[]; v: number[] }>;
  onControl?: (key: string, val: any) => Promise<void> | void;
}

const GridCell = React.memo(
  function GridCell({
    item,
    isEditing,
    isSelected,
    onSelectWidget,
    variableValues,
    seriesMap,
    onControl,
  }: GridCellProps) {
    return (
      <div
        onClick={(e) => {
          if (isEditing) {
            e.stopPropagation();
            onSelectWidget(item);
          }
        }}
        className={`widget-frame select-none relative h-full rounded-sm ${
          isEditing ? "is-editable" : ""
        } ${isEditing && isSelected ? "is-selected" : ""}`}
      >
        {/* Widget 3-dot Drag Handle */}
        {isEditing && (
          <div
            className="drag-handle"
            role="button"
            title="Drag to move"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="drag-grip"></span>
            <span className="drag-grip"></span>
            <span className="drag-grip"></span>
          </div>
        )}

        {/* Widget Custom Element Host */}
        <div className="h-full w-full pointer-events-auto">
          <WidgetDispatcher
            item={item}
            variableValues={variableValues}
            seriesMap={seriesMap}
            onControl={onControl}
          />
        </div>
      </div>
    );
  },
  (prev, next) => {
    if (prev.isEditing !== next.isEditing) return false;
    if (prev.isSelected !== next.isSelected) return false;
    if (prev.item !== next.item) return false;
    if (prev.onControl !== next.onControl) return false;
    if (prev.onSelectWidget !== next.onSelectWidget) return false;

    const itemType = next.item.type;

    if (itemType === "iot-chart") {
      const rawSeries = (next.item.props?.series as any[]) || [];
      const vars: string[] = Array.isArray(rawSeries) && rawSeries.length > 0
        ? rawSeries.map((s: any) => s.variable).filter(Boolean)
        : Array.isArray(next.item.props?.variables)
          ? (next.item.props.variables as string[])
          : next.item.props?.variable
            ? [next.item.props.variable as string]
            : [];

      for (const v of vars) {
        if (prev.seriesMap?.[v] !== next.seriesMap?.[v]) return false;
      }
      return true;
    }

    const primaryVar = next.item.props?.variable as string | undefined;
    if (primaryVar) {
      return prev.variableValues?.[primaryVar] === next.variableValues?.[primaryVar];
    }

    return true;
  }
);

export function DashboardGrid({
  layout,
  isEditing,
  selectedId,
  onSelectWidget,
  onLayoutChange,
  onRemoveWidget: _onRemoveWidget,
  variableValues = {},
  seriesMap = {},
  onControl,
}: DashboardGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [containerWidth, setContainerWidth] = useState<number>(1200);

  useEffect(() => {
    setMounted(true);
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width > 0) {
          setContainerWidth(width);
        }
      }
    });

    observer.observe(el);
    if (el.clientWidth > 0) {
      setContainerWidth(el.clientWidth);
    }

    return () => observer.disconnect();
  }, []);

  // In view mode (or narrow containers), automatically adapt to mobile layout if width < 800px
  const activeLayout = useMemo(() => {
    if (!isEditing && containerWidth < 800) {
      return effectiveMobileLayout(layout);
    }
    return layout;
  }, [isEditing, containerWidth, layout]);

  const rglLayout: Layout = useMemo(() => {
    return activeLayout.items.map((it) => {
      let minW = 2;
      let minH = 2;
      try {
        const spec = widgets.manifestFor(it.type as any);
        if (spec?.minSize?.w) minW = spec.minSize.w;
        if (spec?.minSize?.h) minH = spec.minSize.h;
      } catch {}

      return {
        i: it.id,
        x: it.x,
        y: it.y,
        w: it.w,
        h: it.h,
        minW,
        minH,
        isDraggable: isEditing,
        isResizable: isEditing,
      };
    });
  }, [activeLayout.items, isEditing]);

  const handleRglLayoutChange = (newLayout: Layout) => {
    if (!isEditing) return;

    const map = new Map(layout.items.map((it) => [it.id, it]));
    const updatedItems: WidgetInstance[] = [];

    for (const item of newLayout) {
      const existing = map.get(item.i);
      if (existing) {
        updatedItems.push({
          ...existing,
          x: item.x,
          y: item.y,
          w: item.w,
          h: item.h,
        });
      }
    }

    onLayoutChange({
      ...layout,
      items: updatedItems,
    });
  };

  return (
    <div
      ref={containerRef}
      data-editing={isEditing ? "true" : "false"}
      onClick={() => {
        if (isEditing) {
          onSelectWidget(null);
        }
      }}
      className={`w-full min-h-full max-w-full overflow-x-hidden select-none relative transition-all ${
        isEditing ? "is-editing pb-40" : "is-viewing"
      }`}
    >
      {!mounted ? (
        <div className="w-full min-h-75 flex items-center justify-center">
          <div className="size-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : activeLayout.items.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-16 text-center flex flex-col items-center justify-center my-8">
          <p className="text-foreground text-sm mb-1 font-medium">Empty Dashboard</p>
          <p className="text-muted-foreground text-xs">
            {isEditing
              ? "Select widgets from the catalog on the left to add them to your canvas."
              : "This dashboard has no widgets configured yet."}
          </p>
        </div>
      ) : (
        <GridLayout
          className={`layout ${isEditing ? "is-editing" : "is-viewing"}`}
          layout={rglLayout}
          width={containerWidth}
          gridConfig={{
            cols: 24,
            rowHeight: 40,
            margin: containerWidth < 640 ? ([6, 6] as const) : ([12, 12] as const),
          }}
          dragConfig={{
            enabled: isEditing,
            handle: ".drag-handle",
          }}
          resizeConfig={{
            enabled: isEditing,
          }}
          onLayoutChange={handleRglLayoutChange}
        >
          {activeLayout.items.map((item) => {
            const isSelected = selectedId === item.id;

            return (
              <div key={item.id}>
                <GridCell
                  item={item}
                  isEditing={isEditing}
                  isSelected={isSelected}
                  onSelectWidget={onSelectWidget}
                  variableValues={variableValues}
                  seriesMap={seriesMap}
                  onControl={onControl}
                />
              </div>
            );
          })}
        </GridLayout>
      )}
    </div>
  );
}
