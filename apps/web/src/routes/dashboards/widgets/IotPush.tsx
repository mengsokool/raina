"use client";

import React, { useState } from "react";
import type { WidgetManifest } from "./registry";

interface IotPushProps {
  props: {
    title?: string;
    label?: string;
    variable?: string;
    [key: string]: any;
  };
  value?: any;
  onControl?: (key: string, val: any) => Promise<void> | void;
}

export const iotPushManifest = {
  id: "iot-push", label: "Push", description: "Hold to drive a boolean true; release sets it false.", category: "Control",
  dataTypes: ["Momentary command"], usage: "Momentary push-and-hold for a boolean — true while held, false on release.",
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none"/></svg>',
  defaultSize: { w: 5, h: 3 }, defaultProps: { title: "", variable: "", label: "" },
  fields: [{ key: "title", label: "Title", type: "string" }, { key: "variable", label: "Variable", type: "variable" }, { key: "label", label: "Button label (optional)", type: "string" }],
  quirks: { mobile: { paired: true } },
} satisfies WidgetManifest;

export function IotPush({ props, onControl }: IotPushProps) {
  const displayTitle = props.title ?? "";
  const displayLabel = props.label || "PUSH";
  const [held, setHeld] = useState(false);

  const hold = () => {
    if (held) return;
    setHeld(true);
    if (props.variable && onControl) {
      onControl(props.variable, true);
    }
  };

  const release = () => {
    if (!held) return;
    setHeld(false);
    if (props.variable && onControl) {
      onControl(props.variable, false);
    }
  };

  return (
    <div className="iot-widget-host iot-push">
      <div className="card">
        <div className="title">{displayTitle}</div>
        <div className="button-wrap">
          <button
            className={`button ${held ? "pressing" : ""}`}
            type="button"
            onPointerDown={hold}
            onPointerUp={release}
            onPointerCancel={release}
            onContextMenu={(e) => e.preventDefault()}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                hold();
              }
            }}
            onKeyUp={(e) => {
              if (e.key === " " || e.key === "Enter") {
                release();
              }
            }}
          >
            <span className="label">{displayLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
