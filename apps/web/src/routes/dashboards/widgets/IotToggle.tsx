"use client";

import React, { useState, useEffect } from "react";
import type { WidgetManifest } from "./registry";

interface IotToggleProps {
  props: {
    title?: string;
    label?: string;
    variable?: string;
    onValue?: any;
    offValue?: any;
    [key: string]: any;
  };
  value?: any;
  onControl?: (key: string, val: any) => Promise<void> | void;
}

export const iotToggleManifest = {
  id: "iot-toggle", label: "Toggle", description: "Send an on/off command to a device.", category: "Control",
  dataTypes: ["Boolean command"], usage: "Send an on/off command to a device — relays, switches, actuators. Reflects the latest reported state.",
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="7" width="19" height="10" rx="5"/><circle cx="16.5" cy="12" r="2.5" fill="currentColor" stroke="none"/></svg>',
  defaultSize: { w: 5, h: 3 }, defaultProps: { title: "", variable: "", onValue: "on", offValue: "off" },
  fields: [{ key: "title", label: "Title", type: "string" }, { key: "variable", label: "Variable", type: "variable" }, { type: "group", fields: [{ key: "onValue", label: "On value", type: "string" }, { key: "offValue", label: "Off value", type: "string" }] }],
  quirks: { mobile: { paired: true } },
} satisfies WidgetManifest;

export function IotToggle({ props, value, onControl }: IotToggleProps) {
  const displayTitle = props.title ?? props.label ?? "";
  const onValue = props.onValue !== undefined && props.onValue !== "" ? String(props.onValue) : "ON";
  const offValue = props.offValue !== undefined && props.offValue !== "" ? String(props.offValue) : "OFF";

  const isOnCheck = (c: any): boolean => {
    if (c === null || c === undefined) return false;
    if (String(c).toLowerCase() === onValue.toLowerCase()) return true;
    if (String(c).toLowerCase() === offValue.toLowerCase()) return false;
    if (typeof c === "boolean") return c;
    if (typeof c === "number") return c !== 0;
    const s = String(c).trim().toLowerCase();
    return s === "on" || s === "1" || s === "true" || s === "yes";
  };

  const [current, setCurrent] = useState<any>(value);

  useEffect(() => {
    setCurrent(value);
  }, [value]);

  const on = isOnCheck(current);

  const handleSelect = (targetVal: string) => {
    setCurrent(targetVal);
    if (props.variable && onControl) {
      onControl(props.variable, targetVal);
    }
  };

  const handleToggle = () => {
    handleSelect(on ? offValue : onValue);
  };

  return (
    <div className="iot-widget-host iot-toggle">
      <div className="card">
        <div className="title truncate">{displayTitle}</div>
        <div className="switch-wrap">
          <button
            type="button"
            className={`square-switch-track ${on ? "on" : "off"}`}
            onClick={handleToggle}
            role="switch"
            aria-checked={on}
          >
            {/* Smooth Sliding Square Thumb with Tactile Grip */}
            <div className={`square-switch-thumb ${on ? "on" : "off"}`}>
              <div className="thumb-grip">
                <span />
                <span />
                <span />
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
