"use client";

import React from "react";
import type { WidgetManifest } from "./registry";

type Threshold = { value: number; color: string };

interface IotGaugeProps {
  props: {
    title?: string;
    label?: string;
    variable?: string;
    min?: number;
    max?: number;
    unit?: string;
    color?: string;
    thresholds?: Threshold[];
    [key: string]: any;
  };
  value?: any;
}

export const iotGaugeManifest = {
  id: "iot-gauge", label: "Gauge", description: "Arc gauge with min/max bounds.", category: "Monitor",
  dataTypes: ["Numeric (bounded)"], usage: "Visualize a single bounded value such as battery percentage, fill level, or signal strength.",
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17a9 9 0 0 1 18 0"/><path d="M12 17l4.5-4.5"/><circle cx="12" cy="17" r="1.6" fill="currentColor" stroke="none"/></svg>',
  defaultSize: { w: 5, h: 5 }, defaultProps: { title: "", variable: "", min: 0, max: 100, unit: "", color: "#84cc16", thresholds: [] },
  fields: [{ key: "title", label: "Title", type: "string" }, { key: "variable", label: "Variable", type: "variable" }, { type: "group", fields: [{ key: "min", label: "Min", type: "number" }, { key: "max", label: "Max", type: "number" }, { key: "unit", label: "Unit", type: "string" }] }, { key: "color", label: "Gauge Colour", type: "color", default: "#84cc16" }, { key: "thresholds", label: "Colour thresholds", type: "block", addLabel: "Add threshold", removeLabel: "Remove threshold", fields: [{ type: "group", fields: [{ key: "value", label: "From Value", type: "number", default: 0 }, { key: "color", label: "Colour", type: "color", default: "#84cc16" }] }] }],
  quirks: { mobile: { paired: true } },
} satisfies WidgetManifest;

export function IotGauge({ props, value }: IotGaugeProps) {
  const displayTitle = props.title ?? props.label ?? "";
  const min = Number(props.min ?? 0);
  const max = Number(props.max ?? 100);
  const unit = props.unit ?? "";

  const numVal =
    value === null || value === undefined
      ? null
      : typeof value === "number"
      ? value
      : Number(value);

  const validNum = numVal !== null && Number.isFinite(numVal) ? numVal : null;

  // Full semicircle is ~125.66 (pi * 40)
  const range = max - min;
  const pct = validNum !== null && range > 0 ? Math.max(0, Math.min(1, (validNum - min) / range)) : 0;
  const filled = pct * 125.66;
  const strokeDash = validNum !== null ? `${filled} 125.66` : "0 125.66";

  const colorFor = (val: number | null): string => {
    if (val !== null && Array.isArray(props.thresholds) && props.thresholds.length > 0) {
      const sorted = [...props.thresholds].sort((a, b) => a.value - b.value);
      let matched: string | null = null;
      for (const t of sorted) {
        if (val >= t.value) matched = t.color;
        else break;
      }
      if (matched) return matched;
    }
    return props.color || "var(--primary, #84cc16)";
  };

  const arcColor = colorFor(validNum);

  return (
    <div className="iot-widget-host iot-gauge">
      <div className="card">
        <div className="title">{displayTitle}</div>
        <div className="gauge">
          <svg viewBox="0 0 100 60" preserveAspectRatio="xMidYMid meet">
            <path
              className="track"
              d="M 10 50 A 40 40 0 0 1 90 50"
              strokeWidth="8"
              fill="none"
              strokeLinecap="round"
            />
            <path
              className="arc"
              d="M 10 50 A 40 40 0 0 1 90 50"
              strokeWidth="8"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={strokeDash}
              stroke={arcColor}
            />
          </svg>
          <div className="center">
            <div className="value">
              {validNum === null
                ? "—"
                : Number.isInteger(validNum)
                ? String(validNum)
                : validNum.toFixed(1)}
              {unit && (
                <span className="unit text-xs ml-0.5 font-medium opacity-70">
                  {unit}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
