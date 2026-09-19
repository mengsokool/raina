"use client";

import React, { useState, useEffect, useRef } from "react";
import type { WidgetManifest } from "./registry";

interface IotSliderProps {
  props: {
    title?: string;
    label?: string;
    variable?: string;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    orientation?: "horizontal" | "vertical";
    [key: string]: any;
  };
  value?: any;
  onControl?: (key: string, val: any) => Promise<void> | void;
}

export const iotSliderManifest = {
  id: "iot-slider", label: "Slider", description: "Set a numeric value within a range.", category: "Control",
  dataTypes: ["Numeric command"], usage: "Set a continuous numeric value — brightness, fan speed, setpoint, volume.",
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18"/><circle cx="14" cy="12" r="3.25" fill="currentColor" stroke="none"/></svg>',
  defaultSize: { w: 6, h: 3 }, defaultProps: { title: "", variable: "", orientation: "horizontal", min: 0, max: 100, step: 1, unit: "" },
  fields: [{ key: "title", label: "Title", type: "string" }, { key: "variable", label: "Variable", type: "variable" }, { key: "orientation", label: "Orientation", type: "select", options: ["horizontal", "vertical"] }, { type: "group", fields: [{ key: "min", label: "Min", type: "number" }, { key: "max", label: "Max", type: "number" }] }, { type: "group", fields: [{ key: "step", label: "Step", type: "number" }, { key: "unit", label: "Unit", type: "string" }] }],
  quirks: { swapDimensionsOnPropChange: "orientation" },
} satisfies WidgetManifest;

export function IotSlider({ props, value, onControl }: IotSliderProps) {
  const displayTitle = props.title ?? props.label ?? "";
  const min = Number(props.min ?? 0);
  const max = Number(props.max ?? 100);
  const step = Number(props.step ?? 1) > 0 ? Number(props.step ?? 1) : 1;
  const unit = props.unit ?? "";
  const isVertical = props.orientation === "vertical";

  const numVal =
    value === null || value === undefined
      ? null
      : typeof value === "number"
      ? value
      : Number(value);
  const validNum = numVal !== null && Number.isFinite(numVal) ? numVal : null;

  const [current, setCurrent] = useState<number | null>(validNum);
  const [dragging, setDragging] = useState<boolean>(false);
  const [pending, setPending] = useState<number | null>(null);

  useEffect(() => {
    if (!dragging) {
      setCurrent(validNum);
    }
  }, [validNum, dragging]);

  const display = pending ?? current;

  const pct =
    display !== null && max > min
      ? Math.max(0, Math.min(1, (display - min) / (max - min)))
      : 0;

  const lastSentRef = useRef<number>(0);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingValRef = useRef<number | null>(null);

  const sendThrottled = (val: number) => {
    pendingValRef.current = val;
    const now = Date.now();
    const elapsed = now - lastSentRef.current;
    const THROTTLE_MS = 60;

    if (elapsed >= THROTTLE_MS) {
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
      lastSentRef.current = now;
      if (props.variable && onControl) {
        onControl(props.variable, val);
      }
    } else if (!throttleTimerRef.current) {
      throttleTimerRef.current = setTimeout(() => {
        throttleTimerRef.current = null;
        lastSentRef.current = Date.now();
        if (pendingValRef.current !== null && props.variable && onControl) {
          onControl(props.variable, pendingValRef.current);
        }
      }, THROTTLE_MS - elapsed);
    }
  };

  const handlePointerDown = () => {
    setDragging(true);
  };

  const handleInput = (e: React.FormEvent<HTMLInputElement>) => {
    const val = Number(e.currentTarget.value);
    setPending(val);
    sendThrottled(val);
  };

  const commit = (valToCommit: number) => {
    if (throttleTimerRef.current) {
      clearTimeout(throttleTimerRef.current);
      throttleTimerRef.current = null;
    }
    setDragging(false);
    setPending(null);
    setCurrent(valToCommit);
    lastSentRef.current = Date.now();
    if (props.variable && onControl) {
      onControl(props.variable, valToCommit);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    commit(Number(e.target.value));
  };

  const displayFormatted =
    display === null
      ? "—"
      : Number.isInteger(step) && Number.isInteger(display)
      ? String(display)
      : Number(display).toFixed(1);

  return (
    <div
      className="iot-widget-host iot-slider"
      data-orientation={props.orientation ?? "horizontal"}
    >
      <div className="card">
        <div className="head">
          <div className="title">{displayTitle}</div>
          <div className="reading">
            <span className="value">{displayFormatted}</span>
            <span className="unit">{unit}</span>
          </div>
        </div>
        <div className="control">
          <div className="track-wrap">
            <div className="track">
              <div
                className="fill"
                style={
                  isVertical
                    ? { height: `${pct * 100}%`, width: "100%", inset: "auto 0 0 0" }
                    : { width: `${pct * 100}%`, height: "", inset: "0 auto 0 0" }
                }
              />
            </div>
            <input
              className="range"
              type="range"
              min={min}
              max={max}
              step={step}
              value={display !== null ? display : min}
              onPointerDown={handlePointerDown}
              onChange={handleChange}
              onInput={handleInput}
            />
            <div
              className="thumb"
              style={
                isVertical
                  ? { left: "50%", top: `${(1 - pct) * 100}%` }
                  : { top: "50%", left: `${pct * 100}%` }
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
