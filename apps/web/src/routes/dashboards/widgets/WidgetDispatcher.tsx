import React from "react";
import { WidgetInstance } from "@/types";
import { definitionFor } from "./registry";

interface WidgetDispatcherProps {
  item: WidgetInstance;
  variableValues?: Record<string, any>;
  seriesMap?: Record<string, { t: number[]; v: number[] }>;
  onControl?: (key: string, val: any) => Promise<void> | void;
}

export const WidgetDispatcher = React.memo(function WidgetDispatcher({
  item,
  variableValues = {},
  seriesMap = {},
  onControl,
}: WidgetDispatcherProps) {
  // Helper to extract scalar value whether passed as a primitive or { value: ... }
  const getScalarValue = (val: unknown) => {
    if (typeof val === "object" && val !== null && "value" in val) {
      return (val as { value: unknown }).value;
    }
    return val;
  };

  const primaryVar = item.props?.variable as string | undefined;
  const val = primaryVar && variableValues[primaryVar] !== undefined
    ? getScalarValue(variableValues[primaryVar])
    : undefined;

  const definition = definitionFor(item.type);
  if (!definition) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-neutral-900/90 border border-neutral-800 rounded-xl p-4 text-center">
        <span className="text-xs text-neutral-400 font-mono">Unknown Widget</span>
        <span className="text-[10px] text-neutral-500 font-mono mt-1">{item.type}</span>
      </div>
    );
  }

  const Component = definition.Component;
  return <Component props={item.props} value={val} seriesMap={seriesMap} widgetId={item.id} onControl={onControl} />;
});
