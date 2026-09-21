"use client";

import React from "react";
import type { WidgetManifest } from "./registry";

type Threshold = { value: number; color: string };

const C = 2 * Math.PI * 42;

interface IotPercentProps {
  props: {
    title?: string;
    label?: string;
    variable?: string;
    min?: number;
    max?: number;
    unit?: string;
    thresholds?: Threshold[];
    [key: string]: any;
  };
  value?: any;
}

export const iotPercentManifest = {
  id: "iot-percent", label: "Percentage", description: "Circular percentage ring with colour thresholds.", category: "Monitor",
  dataTypes: ["Percentage"], usage: "Show a value as a percentage of a range — battery, capacity, progress, utilization.",
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m15 9-6 6"/><path d="M9 9h.01"/><path d="M15 15h.01"/></svg>',
  defaultSize: { w: 5, h: 5 }, defaultProps: { title: "", variable: "", min: 0, max: 100, unit: "%", thresholds: [] },
  fields: [{ key: "title", label: "Title", type: "string" }, { key: "variable", label: "Variable", type: "variable" }, { type: "group", fields: [{ key: "min", label: "Min", type: "number" }, { key: "max", label: "Max", type: "number" }, { key: "unit", label: "Unit", type: "string" }] }, { key: "thresholds", label: "Colour thresholds", type: "block", addLabel: "Add threshold", removeLabel: "Remove threshold", fields: [{ type: "group", fields: [{ key: "value", label: "From", type: "number", suffix: "%", default: 0 }, { key: "color", label: "Colour", type: "color", default: "#22c55e" }] }] }],
} satisfies WidgetManifest;

export function IotPercent({ props, value }: IotPercentProps) {
  const displayTitle = props.title ?? props.label ?? "";
  const min = Number(props.min ?? 0);
  const max = Number(props.max ?? 100);
  const unit = props.unit ?? "%";

  const numVal =
    value === null || value === undefined
      ? null
      : typeof value === "number"
      ? value
      : Number(value);
  const validNum = numVal !== null && Number.isFinite(numVal) ? numVal : null;

  const range = max - min;
  const pct =
    validNum !== null && range !== 0
      ? Math.min(1, Math.max(0, (validNum - min) / range))
      : 0;
  const displayPct = pct * 100;

  // Colour for the band with the greatest value <= pct; else accent.
  const colorFor = (percentValue: number): string => {
    const thresholds = Array.isArray(props.thresholds) ? props.thresholds : [];
    const sorted = [...thresholds].sort((a, b) => a.value - b.value);
    let color: string | null = null;
    for (const t of sorted) {
      if (percentValue >= t.value) color = t.color;
      else break;
    }
    return color ?? "var(--color-foreground, #171717)";
  };

  const arcColor = colorFor(displayPct);

  return (
    <div className="iot-widget-host iot-percent">
      <div className="card">
        <div className="title">{displayTitle}</div>
        <div className="percent-ring">
          <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
            <circle className="track" cx="50" cy="50" r="42" strokeWidth="9" fill="none" />
            <circle
              className={`arc ${validNum !== null && pct > 0 ? "visible" : "invisible"}`}
              cx="50"
              cy="50"
              r="42"
              strokeWidth="9"
              fill="none"
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
              strokeDasharray={validNum !== null ? `${pct * C} ${C}` : `0 ${C}`}
              style={{
                "--arc-color": arcColor,
              } as React.CSSProperties}
            />
          </svg>
          <div className="center">
            <div className="value">{validNum === null ? "—" : String(Math.round(displayPct))}</div>
            <div className="unit">{validNum === null ? "" : unit}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
