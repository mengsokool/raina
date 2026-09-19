"use client";

import React, { useMemo, useState } from "react";
import type { WidgetManifest } from "./registry";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { getCookie, setCookie } from "@/lib/cookies";

type ChartType = "line" | "area" | "bar" | "stepline";

const PALETTE = [
  "#84cc16", // Lime
  "#06b6d4", // Cyan
  "#3b82f6", // Blue
  "#f59e0b", // Amber
  "#ec4899", // Pink
  "#8b5cf6", // Violet
  "#f97316", // Orange
  "#10b981", // Emerald
];

const ALL_TIME_WINDOWS = ["30s", "1m", "5m", "15m", "1h", "6h", "24h", "All"] as const;

const WINDOW_MS: Record<string, number> = {
  "30s": 30 * 1000,
  "1m": 60 * 1000,
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
};

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

interface IotChartProps {
  widgetId?: string;
  props: {
    title?: string;
    label?: string;
    chartType?: "line" | "area" | "bar" | "stepline";
    zoom?: boolean;
    window?: string;
    showHotkeys?: boolean;
    hotkeys?: string[];
    series?: Array<{ variable: string; label?: string; color?: string }>;
    variables?: string[];
    variable?: string;
    [key: string]: any;
  };
  seriesMap?: Record<string, { t: number[]; v: number[] }>;
}

function IotChartComponent({ widgetId, props, seriesMap }: IotChartProps) {
  const displayTitle = props.title ?? props.label ?? "";
  const chartType = ((props.chartType ?? "line").toLowerCase()) as ChartType;

  const storageKey = useMemo(() => {
    return widgetId
      ? `raina_cw_${widgetId}`
      : displayTitle
      ? `raina_cw_${displayTitle.replace(/\s+/g, "_")}`
      : "raina_cw_default";
  }, [widgetId, displayTitle]);

  const showHotkeys = props.showHotkeys !== false;
  const activeHotkeys = useMemo(() => {
    if (Array.isArray(props.hotkeys)) {
      const filtered = props.hotkeys.filter((h) => ALL_TIME_WINDOWS.includes(h as any));
      if (filtered.length > 0) return filtered;
    }
    return ["30s", "1m", "5m", "15m", "1h", "6h", "24h", "All"];
  }, [props.hotkeys]);

  const [selectedWindow, setSelectedWindow] = useState<string>(() => {
    // 1. Try saved window in cookie / localStorage
    const saved = getCookie(storageKey);
    if (saved && ALL_TIME_WINDOWS.includes(saved as any)) {
      return saved;
    }
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const lsVal = localStorage.getItem(storageKey);
        if (lsVal && ALL_TIME_WINDOWS.includes(lsVal as any)) {
          return lsVal;
        }
      } catch {}
    }

    // 2. Default from props
    if (props.window && ALL_TIME_WINDOWS.includes(props.window as any)) {
      return props.window;
    }

    // 3. Fallback
    return activeHotkeys.includes("All") ? "All" : activeHotkeys[0] || "All";
  });

  const handleSelectWindow = (w: string) => {
    setSelectedWindow(w);
    setCookie(storageKey, w, 365);
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        localStorage.setItem(storageKey, w);
      } catch {}
    }
  };

  const rawSeries = useMemo(() => {
    if (Array.isArray(props.series) && props.series.length > 0) {
      return props.series.map((s, i) => ({
        key: s.variable,
        label: s.label || s.variable,
        color: s.color || PALETTE[i % PALETTE.length]!,
      }));
    }
    if (Array.isArray(props.variables) && props.variables.length > 0) {
      return props.variables.map((v, i) => ({
        key: v,
        label: v,
        color: PALETTE[i % PALETTE.length]!,
      }));
    }
    if (props.variable) {
      return [
        {
          key: props.variable,
          label: props.label || props.variable,
          color: PALETTE[0]!,
        },
      ];
    }
    return [];
  }, [props.series, props.variables, props.variable, props.label]);

  const chartConfig = useMemo<ChartConfig>(() => {
    const config: ChartConfig = {};
    rawSeries.forEach((s) => {
      config[s.key] = {
        label: s.label,
        color: s.color,
      };
    });
    return config;
  }, [rawSeries]);

  const { chartData, earliestTimestamp, latestTimestamp } = useMemo(() => {
    const timeMap = new Map<number, Record<string, number>>();
    let minTs = Infinity;
    let maxTs = 0;

    rawSeries.forEach((s) => {
      const sm = seriesMap?.[s.key];
      if (sm && Array.isArray(sm.t) && Array.isArray(sm.v)) {
        for (let i = 0; i < sm.t.length; i++) {
          const rawT = sm.t[i]!;
          const ms = rawT > 1e11 ? rawT : rawT * 1000;
          if (ms < minTs) minTs = ms;
          if (ms > maxTs) maxTs = ms;

          let entry = timeMap.get(ms);
          if (!entry) {
            entry = { timestamp: ms };
            timeMap.set(ms, entry);
          }
          entry[s.key] = sm.v[i]!;
        }
      }
    });

    const sortedData = Array.from(timeMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([, entry]) => entry);

    return {
      chartData: sortedData,
      earliestTimestamp: minTs === Infinity ? 0 : minTs,
      latestTimestamp: maxTs,
    };
  }, [rawSeries, seriesMap]);

  // Compute X-axis domain based on selected time window
  const xDomain = useMemo<[number | string, number | string]>(() => {
    if (selectedWindow === "All") {
      return ["dataMin", "dataMax"];
    }
    const duration = WINDOW_MS[selectedWindow];
    if (duration) {
      const rightEdge = latestTimestamp > 0 ? latestTimestamp : Date.now();
      return [rightEdge - duration, rightEdge];
    }
    return ["dataMin", "dataMax"];
  }, [selectedWindow, latestTimestamp]);

  const formatTimeTick = (timestamp: number | string) => {
    const ms = typeof timestamp === "number" ? timestamp : Number(timestamp);
    if (isNaN(ms) || ms <= 0) return "";
    const d = new Date(ms);
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    const s = String(d.getSeconds()).padStart(2, "0");

    if (selectedWindow === "30s" || selectedWindow === "1m" || selectedWindow === "5m" || selectedWindow === "15m") {
      return `${h}:${m}:${s}`;
    }
    if (selectedWindow === "1h" || selectedWindow === "6h" || selectedWindow === "24h") {
      return `${h}:${m}`;
    }
    // For "All": if time span > 2 hours, format as HH:mm
    if (latestTimestamp - earliestTimestamp > 2 * 3600 * 1000) {
      return `${h}:${m}`;
    }
    return `${h}:${m}:${s}`;
  };

  const formattedTs = latestTimestamp > 0
    ? new Date(latestTimestamp).toLocaleTimeString()
    : "";

  return (
    <div className="iot-widget-host iot-chart">
      <div className="card select-none">
        <div className="header flex items-center justify-between gap-2 pb-1">
          <div className="title truncate">{displayTitle}</div>
        </div>

        <div className="chart-host relative flex-1 min-h-0">
          {chartData.length === 0 ? (
            <div className="flex h-full w-full items-center justify-center text-xs text-[var(--color-text-faint,#a3a3a3)]">
              No data yet
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="!aspect-auto h-full w-full">
              {chartType === "area" ? (
                <AreaChart
                  accessibilityLayer
                  data={chartData}
                  margin={{ top: 12, right: 12, left: -20, bottom: 0 }}
                >
                  <defs>
                    {rawSeries.map((s) => (
                      <linearGradient
                        key={s.key}
                        id={`fill-${s.key}-${widgetId || "chart"}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor={s.color}
                          stopOpacity={0.35}
                        />
                        <stop
                          offset="95%"
                          stopColor={s.color}
                          stopOpacity={0.02}
                        />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    type="number"
                    domain={xDomain}
                    allowDataOverflow={true}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={28}
                    tickFormatter={formatTimeTick}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickCount={4}
                    domain={["auto", "auto"]}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        indicator="dot"
                        labelFormatter={(value) => {
                          const ms = typeof value === "number" ? value : Number(value);
                          return !isNaN(ms) && ms > 0 ? new Date(ms).toLocaleTimeString() : "";
                        }}
                      />
                    }
                  />
                  {rawSeries.map((s) => (
                    <Area
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      stroke={s.color}
                      strokeWidth={2}
                      connectNulls={true}
                      fill={`url(#fill-${s.key}-${widgetId || "chart"})`}
                      isAnimationActive={false}
                    />
                  ))}
                </AreaChart>
              ) : chartType === "bar" ? (
                <BarChart
                  accessibilityLayer
                  data={chartData}
                  margin={{ top: 12, right: 12, left: -20, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    type="number"
                    domain={xDomain}
                    allowDataOverflow={true}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={28}
                    tickFormatter={formatTimeTick}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickCount={4}
                    domain={["auto", "auto"]}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        indicator="dashed"
                        labelFormatter={(value) => {
                          const ms = typeof value === "number" ? value : Number(value);
                          return !isNaN(ms) && ms > 0 ? new Date(ms).toLocaleTimeString() : "";
                        }}
                      />
                    }
                  />
                  {rawSeries.map((s) => (
                    <Bar
                      key={s.key}
                      dataKey={s.key}
                      fill={s.color}
                      radius={[4, 4, 0, 0]}
                      isAnimationActive={false}
                    />
                  ))}
                </BarChart>
              ) : (
                <LineChart
                  accessibilityLayer
                  data={chartData}
                  margin={{ top: 12, right: 12, left: -20, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    type="number"
                    domain={xDomain}
                    allowDataOverflow={true}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={28}
                    tickFormatter={formatTimeTick}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickCount={4}
                    domain={["auto", "auto"]}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        indicator="dot"
                        labelFormatter={(value) => {
                          const ms = typeof value === "number" ? value : Number(value);
                          return !isNaN(ms) && ms > 0 ? new Date(ms).toLocaleTimeString() : "";
                        }}
                      />
                    }
                  />
                  {rawSeries.map((s) => (
                    <Line
                      key={s.key}
                      type={chartType === "stepline" ? "stepAfter" : "monotone"}
                      dataKey={s.key}
                      stroke={s.color}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                      connectNulls={true}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              )}
            </ChartContainer>
          )}
        </div>

        {/* Footer: Color Legend & Time Range Hotkeys */}
        {(rawSeries.length > 0 || (showHotkeys && activeHotkeys.length > 0)) && (
          <div className="footer flex items-center justify-between gap-2 pt-1.5 mt-auto flex-wrap shrink-0 border-t border-neutral-100 dark:border-neutral-800/60">
            {/* Color Legend */}
            <div className="flex items-center gap-2 overflow-x-auto min-w-0 flex-1">
              {rawSeries.map((s) => (
                <div key={s.key} className="flex items-center gap-1.5 text-[10px] text-neutral-500 dark:text-neutral-400 font-mono shrink-0">
                  <span className="h-1.5 w-2.5 rounded-none inline-block shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="truncate">{s.label}</span>
                </div>
              ))}
            </div>

            {/* Quick Time Range Pills */}
            {showHotkeys && activeHotkeys.length > 0 && (
              <div className="inline-flex items-center rounded-none border border-neutral-200 dark:border-neutral-800 p-0.5 bg-neutral-100 dark:bg-neutral-900 text-[10px] flex-wrap shrink-0">
                {activeHotkeys.map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => handleSelectWindow(w)}
                    className={`px-1.5 py-0.5 rounded-none transition-colors font-mono font-medium ${
                      selectedWindow === w
                        ? "bg-white text-neutral-900 shadow-xs dark:bg-neutral-800 dark:text-neutral-100 font-semibold"
                        : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200"
                    }`}
                  >
                    {w}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export const IotChart = React.memo(IotChartComponent);

export const iotChartManifest = {
  id: "iot-chart", label: "Chart", description: "Time-series chart with one or more series.", category: "Monitor",
  dataTypes: ["Numeric time series"], usage: "Plot trends for one or more metrics over a time window (15m to 24h).",
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l3.5-3.5 3 2L19 6"/><circle cx="19" cy="6" r="1.4" fill="currentColor" stroke="none"/></svg>',
  defaultSize: { w: 8, h: 5 }, defaultProps: { title: "", window: "All", chartType: "line", showHotkeys: true, hotkeys: ["30s", "1m", "5m", "15m", "1h", "6h", "24h", "All"], series: [] },
  fields: [
    { key: "title", label: "Title", type: "string" }, { key: "window", label: "Default Window", type: "select", options: ["All", "30s", "1m", "5m", "15m", "1h", "6h", "24h"] },
    { key: "chartType", label: "Type", type: "select", options: ["line", "area", "bar", "stepline"] }, { key: "showHotkeys", label: "Show Hotkeys", type: "boolean" },
    { key: "hotkeys", label: "Visible Hotkeys", type: "multiselect", options: ["30s", "1m", "5m", "15m", "1h", "6h", "24h", "All"] },
    { key: "series", label: "Series", type: "block", addLabel: "Add series", removeLabel: "Remove series", fields: [{ key: "variable", type: "variable", placeholder: "variable", default: "" }, { type: "group", fields: [{ key: "label", label: "Label", type: "string", placeholder: "label (optional)", default: "" }, { key: "color", label: "Colour", type: "color", default: "#84cc16" }] }] },
  ],
} satisfies WidgetManifest;



