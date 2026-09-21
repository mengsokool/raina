"use client";

import React, { useState, useEffect, useRef } from "react";
import type { WidgetManifest } from "./registry";

type Rgb = { r: number; g: number; b: number };
type Hsv = { h: number; s: number; v: number };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function hsvToRgb(h: number, s: number, v: number): Rgb {
  const c = v * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) { r = c; g = x; }
  else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; }
  else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; }
  else { r = c; b = x; }
  const m = v - c;
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function rgbToHsv(r: number, g: number, b: number): Hsv {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = h * 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

const hex2 = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
const rgbToHex = ({ r, g, b }: Rgb) => `#${hex2(r)}${hex2(g)}${hex2(b)}`.toUpperCase();

function hexToRgb(input: string): Rgb | null {
  let s = input.trim().replace(/^#/, "");
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

function parseColor(v: unknown): Hsv | null {
  if (typeof v === "string") {
    const rgb = hexToRgb(v);
    return rgb ? rgbToHsv(rgb.r, rgb.g, rgb.b) : null;
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const num = (k: string) => (typeof o[k] === "number" ? (o[k] as number) : NaN);
    if (Number.isFinite(num("h")) && Number.isFinite(num("s")) && Number.isFinite(num("v"))) {
      const s = num("s"), vv = num("v");
      return {
        h: ((num("h") % 360) + 360) % 360,
        s: clamp(s > 1 ? s / 100 : s, 0, 1),
        v: clamp(vv > 1 ? vv / 100 : vv, 0, 1),
      };
    }
    if (Number.isFinite(num("r")) && Number.isFinite(num("g")) && Number.isFinite(num("b"))) {
      return rgbToHsv(clamp(num("r"), 0, 255), clamp(num("g"), 0, 255), clamp(num("b"), 0, 255));
    }
  }
  return null;
}

const PRESETS: ReadonlyArray<{ label: string; hex: string }> = [
  { label: "Warm white", hex: "#FFC98A" },
  { label: "Cool white", hex: "#F4F8FF" },
  { label: "Red", hex: "#FF2D2D" },
  { label: "Amber", hex: "#FF8A1F" },
  { label: "Green", hex: "#2DD46A" },
  { label: "Blue", hex: "#2D6BFF" },
  { label: "Purple", hex: "#B23BFF" },
];

interface IotColorProps {
  props: {
    title?: string;
    label?: string;
    variable?: string;
    format?: "hex" | "hsv" | "rgb";
    brightness?: boolean;
    hexInput?: boolean;
    presets?: boolean;
    [key: string]: any;
  };
  value?: any;
  onControl?: (key: string, val: any) => Promise<void> | void;
}

export const iotColorManifest = {
  id: "iot-color", label: "Color", description: "Pick a color and send it to a device.", category: "Control",
  dataTypes: ["Color command"], usage: "Set the color of a smart light or RGB device — Hue bulbs, LED strips, ambient lighting.",
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.83-.44-1.12-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.66h1.99c3.05 0 5.56-2.5 5.56-5.55C21.96 6.01 17.46 2 12 2z"/><circle cx="8.5" cy="7.5" r="1" fill="currentColor" stroke="none"/><circle cx="13.5" cy="6.5" r="1" fill="currentColor" stroke="none"/><circle cx="17" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="6.5" cy="12" r="1" fill="currentColor" stroke="none"/></svg>',
  defaultSize: { w: 5, h: 6 }, defaultProps: { title: "", variable: "", format: "hex", brightness: true, hexInput: true, presets: true },
  fields: [{ key: "title", label: "Title", type: "string" }, { key: "variable", label: "Variable", type: "variable" }, { key: "format", label: "Output format", type: "select", options: ["hex", "hsv", "rgb"] }, { key: "brightness", label: "Brightness control", type: "boolean" }, { key: "hexInput", label: "Hex input", type: "boolean" }, { key: "presets", label: "Preset swatches", type: "boolean" }],
} satisfies WidgetManifest;

export function IotColor({ props, value, onControl }: IotColorProps) {
  const displayTitle = props.title ?? props.label ?? "";
  const format = props.format ?? "hex";
  const showBrightness = props.brightness !== false;
  const showHexInput = props.hexInput !== false;
  const showPresets = props.presets !== false;

  const [hsv, setHsv] = useState<Hsv>({ h: 0, s: 0, v: 1 });
  const [_ts, setTs] = useState<string>("");
  const [_dragging, setDragging] = useState<boolean>(false);
  const draggingRef = useRef<boolean>(false);
  const lastInteractionRef = useRef<number>(0);
  const [hexVal, setHexVal] = useState<string>("#FFFFFF");
  const wheelRef = useRef<HTMLDivElement>(null);

  const COOLDOWN_MS = 2000;

  useEffect(() => {
    const parsed = parseColor(value);
    if (!parsed) return;
    if (draggingRef.current) return;
    const elapsed = Date.now() - lastInteractionRef.current;
    if (elapsed < COOLDOWN_MS) return;
    setHsv(parsed);
    setHexVal(rgbToHex(hsvToRgb(parsed.h, parsed.s, parsed.v)));
    setTs(new Date().toLocaleTimeString());
  }, [value]);

  const lastSentRef = useRef<number>(0);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingHsvRef = useRef<Hsv | null>(null);

  const formatOutValue = (hsvVal: Hsv) => {
    const rgb = hsvToRgb(hsvVal.h, hsvVal.s, hsvVal.v);
    switch (format) {
      case "hsv":
        return {
          h: Math.round(hsvVal.h),
          s: Math.round(hsvVal.s * 100),
          v: Math.round(hsvVal.v * 100),
        };
      case "rgb":
        return rgb;
      default:
        return rgbToHex(rgb);
    }
  };

  const sendThrottled = (newHsv: Hsv) => {
    pendingHsvRef.current = newHsv;
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
        onControl(props.variable, formatOutValue(newHsv));
      }
    } else if (!throttleTimerRef.current) {
      throttleTimerRef.current = setTimeout(() => {
        throttleTimerRef.current = null;
        lastSentRef.current = Date.now();
        if (pendingHsvRef.current && props.variable && onControl) {
          onControl(props.variable, formatOutValue(pendingHsvRef.current));
        }
      }, THROTTLE_MS - elapsed);
    }
  };

  const commit = (newHsv: Hsv) => {
    if (throttleTimerRef.current) {
      clearTimeout(throttleTimerRef.current);
      throttleTimerRef.current = null;
    }
    setTs(new Date().toLocaleTimeString());
    lastSentRef.current = Date.now();
    if (!props.variable || !onControl) return;
    onControl(props.variable, formatOutValue(newHsv));
  };

  const pickFromWheel = (clientX: number, clientY: number) => {
    if (!wheelRef.current) return null;
    const rect = wheelRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const radius = Math.min(rect.width, rect.height) / 2;
    const s = radius > 0 ? clamp(Math.hypot(dx, dy) / radius, 0, 1) : 0;
    let h = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (h < 0) h += 360;
    return { h, s };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    setDragging(true);
    lastInteractionRef.current = Date.now();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const picked = pickFromWheel(e.clientX, e.clientY);
    if (picked) {
      const nextHsv = { ...hsv, ...picked };
      setHsv(nextHsv);
      setHexVal(rgbToHex(hsvToRgb(nextHsv.h, nextHsv.s, nextHsv.v)));
      sendThrottled(nextHsv);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    lastInteractionRef.current = Date.now();
    const picked = pickFromWheel(e.clientX, e.clientY);
    if (picked) {
      const nextHsv = { ...hsv, ...picked };
      setHsv(nextHsv);
      setHexVal(rgbToHex(hsvToRgb(nextHsv.h, nextHsv.s, nextHsv.v)));
      sendThrottled(nextHsv);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    lastInteractionRef.current = Date.now();
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    const picked = pickFromWheel(e.clientX, e.clientY);
    const nextHsv = picked ? { ...hsv, ...picked } : hsv;
    setHsv(nextHsv);
    commit(nextHsv);
  };

  const handleBrightnessStart = () => {
    draggingRef.current = true;
    setDragging(true);
    lastInteractionRef.current = Date.now();
  };

  const handleBrightnessUpdate = (vPct: number) => {
    draggingRef.current = true;
    lastInteractionRef.current = Date.now();
    const nextHsv = { ...hsv, v: vPct / 100 };
    setHsv(nextHsv);
    setHexVal(rgbToHex(hsvToRgb(nextHsv.h, nextHsv.s, nextHsv.v)));
    sendThrottled(nextHsv);
  };

  const handleBrightnessEnd = (vPct?: number) => {
    draggingRef.current = false;
    setDragging(false);
    lastInteractionRef.current = Date.now();
    const nextHsv = vPct !== undefined ? { ...hsv, v: vPct / 100 } : hsv;
    setHsv(nextHsv);
    setHexVal(rgbToHex(hsvToRgb(nextHsv.h, nextHsv.s, nextHsv.v)));
    commit(nextHsv);
  };

  const handlePresetClick = (hex: string) => {
    const parsed = parseColor(hex);
    if (!parsed) return;
    lastInteractionRef.current = Date.now();
    setHsv(parsed);
    setHexVal(hex);
    commit(parsed);
  };

  const handleHexBlur = () => {
    const parsed = parseColor(hexVal);
    if (parsed) {
      lastInteractionRef.current = Date.now();
      setHsv(parsed);
      commit(parsed);
    } else {
      setHexVal(rgbToHex(hsvToRgb(hsv.h, hsv.s, hsv.v)));
    }
  };

  const live = hsvToRgb(hsv.h, hsv.s, hsv.v);
  const liveHex = rgbToHex(live);
  const rad = (hsv.h * Math.PI) / 180;
  const handleLeft = `${50 + Math.cos(rad) * hsv.s * 50}%`;
  const handleTop = `${50 + Math.sin(rad) * hsv.s * 50}%`;
  const hueRgb = hsvToRgb(hsv.h, hsv.s, 1);
  const hueColor = rgbToHex(hueRgb);

  return (
    <div className="iot-widget-host iot-color">
      <div className="card">
        <div className="head">
          <div className="title">{displayTitle}</div>
        </div>
        <div className="stage">
          <div
            ref={wheelRef}
            className="wheel"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <div
              className="handle"
              style={{
                "--handle-left": handleLeft,
                "--handle-top": handleTop,
                "--handle-bg": liveHex,
              } as React.CSSProperties}
            />
          </div>
        </div>
        {showBrightness && (
          <div className="bright">
            <span className="bicon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            </span>
            <div className="track-wrap">
              <div
                className="track"
                style={{
                  "--hue-color": hueColor,
                } as React.CSSProperties}
              />
              <input
                className="brange"
                type="range"
                min="0"
                max="100"
                step="1"
                value={Math.round(hsv.v * 100)}
                aria-label="Brightness"
                onPointerDown={handleBrightnessStart}
                onTouchStart={handleBrightnessStart}
                onMouseDown={handleBrightnessStart}
                onKeyDown={handleBrightnessStart}
                onInput={(e) => handleBrightnessUpdate(Number(e.currentTarget.value))}
                onChange={(e) => handleBrightnessUpdate(Number(e.target.value))}
                onPointerUp={(e) => handleBrightnessEnd(Number(e.currentTarget.value))}
                onTouchEnd={(e) => handleBrightnessEnd(Number(e.currentTarget.value))}
                onMouseUp={(e) => handleBrightnessEnd(Number(e.currentTarget.value))}
                onKeyUp={(e) => handleBrightnessEnd(Number(e.currentTarget.value))}
                onBlur={() => handleBrightnessEnd()}
              />
              <div
                className="bthumb"
                style={{
                  "--thumb-left": `${hsv.v * 100}%`,
                } as React.CSSProperties}
              />
            </div>
          </div>
        )}
        {showPresets && (
          <div className="presets">
            {PRESETS.map((p) => (
              <button
                key={p.hex}
                type="button"
                className="swatch"
                style={{
                  "--swatch-color": p.hex,
                } as React.CSSProperties}
                title={p.label}
                aria-label={p.label}
                onClick={() => handlePresetClick(p.hex)}
              />
            ))}
          </div>
        )}
        {showHexInput && (
          <div className="foot">
            <input
              className="hex"
              type="text"
              spellCheck={false}
              autoComplete="off"
              aria-label="Hex colour"
              value={hexVal}
              onChange={(e) => setHexVal(e.target.value)}
              onBlur={handleHexBlur}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleHexBlur();
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
