"use client";

import React from "react";
import type { WidgetManifest } from "./registry";

interface IotValueProps {
  props: {
    title?: string;
    label?: string;
    variable?: string;
    unit?: string;
    [key: string]: any;
  };
  value?: any;
}

export const iotValueManifest = {
  id: "iot-value", label: "Value", description: "Latest reading of one metric.", category: "Monitor",
  dataTypes: ["Numeric", "String", "Boolean"], usage: "Display the most recent reading of a single metric — temperature, pressure, status text.",
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9.5h4"/><path d="M7 14.5h10" stroke-width="2.5"/></svg>',
  defaultSize: { w: 5, h: 3 }, defaultProps: { title: "", variable: "", unit: "" },
  fields: [{ key: "title", label: "Title", type: "string" }, { key: "variable", label: "Variable", type: "variable" }, { key: "unit", label: "Unit", type: "string" }],
  quirks: { mobile: { paired: true } },
} satisfies WidgetManifest;

export function IotValue({ props, value }: IotValueProps) {
  const displayTitle = props.title ?? props.label ?? "";
  const displayUnit = props.unit ?? "";
  const displayVal =
    value === null || value === undefined
      ? "—"
      : typeof value === "number"
      ? Number.isInteger(value)
        ? String(value)
        : String(Number(value.toFixed(2)))
      : String(value);

  return (
    <div className="iot-widget-host iot-value">
      <div className="card">
        <div className="title">{displayTitle}</div>
        <div className="reading">
          <span className="value">{displayVal}</span>
          <span className="unit">{displayUnit}</span>
        </div>
      </div>
    </div>
  );
}
