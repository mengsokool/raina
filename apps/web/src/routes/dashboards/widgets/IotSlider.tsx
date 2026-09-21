"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
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
  const draggingRef = useRef<boolean>(false);
  const lastInteractionRef = useRef<number>(0);
  const latestValRef = useRef<number | null>(validNum);
  const lastSentValRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const lastSentRef = useRef<number>(0);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingValRef = useRef<number | null>(null);

  const COOLDOWN_MS = 2000;

  useEffect(() => {
    if (draggingRef.current) return;
    const elapsed = Date.now() - lastInteractionRef.current;
    if (elapsed < COOLDOWN_MS) {
      return;
    }
    latestValRef.current = validNum;
    setCurrent(validNum);
  }, [validNum]);

  const sendThrottled = useCallback((val: number) => {
    pendingValRef.current = val;
    const now = Date.now();
    const elapsed = now - lastSentRef.current;
    const THROTTLE_MS = 50;

    if (elapsed >= THROTTLE_MS) {
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
      lastSentRef.current = now;
      if (lastSentValRef.current !== val) {
        lastSentValRef.current = val;
        if (props.variable && onControl) {
          onControl(props.variable, val);
        }
      }
    } else if (!throttleTimerRef.current) {
      throttleTimerRef.current = setTimeout(() => {
        throttleTimerRef.current = null;
        lastSentRef.current = Date.now();
        const pending = pendingValRef.current;
        if (pending !== null && lastSentValRef.current !== pending) {
          lastSentValRef.current = pending;
          if (props.variable && onControl) {
            onControl(props.variable, pending);
          }
        }
      }, THROTTLE_MS - elapsed);
    }
  }, [props.variable, onControl]);

  const handleStart = () => {
    draggingRef.current = true;
    setDragging(true);
    lastInteractionRef.current = Date.now();
  };

  const handleUpdate = (val: number) => {
    draggingRef.current = true;
    lastInteractionRef.current = Date.now();
    latestValRef.current = val;
    setCurrent(val);
    sendThrottled(val);
  };

  const handleEnd = useCallback((val?: number) => {
    if (!draggingRef.current && throttleTimerRef.current === null) return;
    draggingRef.current = false;
    setDragging(false);
    lastInteractionRef.current = Date.now();

    if (throttleTimerRef.current) {
      clearTimeout(throttleTimerRef.current);
      throttleTimerRef.current = null;
    }

    const finalVal =
      val !== undefined && !isNaN(val)
        ? val
        : latestValRef.current !== null
        ? latestValRef.current
        : inputRef.current
        ? Number(inputRef.current.value)
        : (current ?? min);

    latestValRef.current = finalVal;
    setCurrent(finalVal);

    if (lastSentValRef.current !== finalVal) {
      lastSentValRef.current = finalVal;
      lastSentRef.current = Date.now();
      if (props.variable && onControl) {
        onControl(props.variable, finalVal);
      }
    }
  }, [min, current, props.variable, onControl]);

  useEffect(() => {
    if (!dragging) return;
    const onRelease = () => {
      handleEnd();
    };
    window.addEventListener("pointerup", onRelease);
    window.addEventListener("pointercancel", onRelease);
    return () => {
      window.removeEventListener("pointerup", onRelease);
      window.removeEventListener("pointercancel", onRelease);
    };
  }, [dragging, handleEnd]);

  useEffect(() => {
    return () => {
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
      }
    };
  }, []);

  const display = current;

  const pct =
    display !== null && max > min
      ? Math.max(0, Math.min(1, (display - min) / (max - min)))
      : 0;

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
                style={{
                  "--fill-pct": `${pct * 100}%`,
                } as React.CSSProperties}
              />
            </div>
            <input
              ref={inputRef}
              className="range"
              type="range"
              min={min}
              max={max}
              step={step}
              value={display !== null ? display : min}
              onPointerDown={handleStart}
              onKeyDown={handleStart}
              onInput={(e) => handleUpdate(Number(e.currentTarget.value))}
              onPointerUp={(e) => handleEnd(Number(e.currentTarget.value))}
              onKeyUp={(e) => handleEnd(Number(e.currentTarget.value))}
              onBlur={() => handleEnd()}
            />
            <div
              className="thumb"
              style={{
                "--thumb-pos": isVertical ? `${(1 - pct) * 100}%` : `${pct * 100}%`,
              } as React.CSSProperties}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
