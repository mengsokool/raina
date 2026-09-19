import React, { memo } from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { AlertTriangle } from "lucide-react";
import { blocks } from "@raina/workflow";
import { BlockData } from "../utils/types";
import { BlockIcon, getBlockTheme } from "../utils/block-icons";

export type FlowNode = Node<BlockData, "block">;

const OP_SYMBOLS: Record<string, string> = {
  ">": ">",
  "<": "<",
  ">=": "≥",
  "<=": "≤",
  "==": "==",
  "!=": "≠",
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDays(days?: number[]) {
  if (!Array.isArray(days) || days.length === 0 || days.length === 7) return "Every day";
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return "Weekdays";
  if (days.length === 2 && [0, 6].every((d) => days.includes(d))) return "Weekends";
  return days
    .slice()
    .sort()
    .map((d) => DAY_NAMES[d])
    .join(", ");
}

function getBlockDisplayContent(kind: string, config: Record<string, unknown> = {}, blockLabel: string) {
  const c = config;
  const s = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());

  switch (kind) {
    case "variable": {
      const varName = s(c.variable);
      const op = s(c.operator);
      const val = s(c.value);
      const cooldown = Number(c.cooldown_seconds ?? 0);

      const tags: string[] = [];
      if (cooldown > 0) tags.push(`${cooldown}s cooldown`);

      if (!varName) {
        return {
          headline: "Choose variable...",
          isPlaceholder: true,
          tags,
        };
      }

      if (op === "changed") {
        return {
          headline: `${varName} changed`,
          tags,
        };
      }

      const opSymbol = OP_SYMBOLS[op] ?? op ?? ">";
      return {
        headline: `${varName} ${opSymbol} ${val || "0"}`,
        tags,
      };
    }

    case "if_variable": {
      const varName = s(c.variable);
      const op = s(c.operator);
      const val = s(c.value);
      const opSymbol = OP_SYMBOLS[op] ?? op ?? "==";

      if (!varName) {
        return {
          headline: "Set condition...",
          isPlaceholder: true,
          tags: [],
        };
      }

      return {
        headline: `${varName} ${opSymbol} ${val !== "" ? val : "?"}`,
        tags: [],
      };
    }

    case "set_variable": {
      const varName = s(c.variable);
      const val = s(c.value);

      if (!varName) {
        return {
          headline: "Set variable...",
          isPlaceholder: true,
          tags: [],
        };
      }

      return {
        headline: `${varName} = ${val !== "" ? val : "—"}`,
        tags: [],
      };
    }

    case "schedule": {
      const time = s(c.time);
      const days = Array.isArray(c.days) ? (c.days as number[]) : [];
      const tz = s(c.tz);
      const tags: string[] = [formatDays(days)];
      if (tz) tags.push(tz.split("/").pop()?.replace(/_/g, " ") ?? tz);

      return {
        headline: time ? `@ ${time}` : "Set time...",
        isPlaceholder: !time,
        tags,
      };
    }

    case "time_window": {
      const from = s(c.from);
      const to = s(c.to);
      const days = Array.isArray(c.days) ? (c.days as number[]) : [];
      const tags: string[] = days.length ? [formatDays(days)] : [];

      if (!from && !to) {
        return {
          headline: "Set time window...",
          isPlaceholder: true,
          tags,
        };
      }

      return {
        headline: `${from || "00:00"} – ${to || "23:59"}`,
        tags,
      };
    }

    case "sunset_sunrise": {
      const event = s(c.event) || "sunset";
      const off = Number(c.offset_minutes ?? 0);
      const tags: string[] = [];
      if (off !== 0) tags.push(`${off > 0 ? `+${off}` : off} min`);

      return {
        headline: event === "sunset" ? "At sunset 🌅" : "At sunrise 🌄",
        tags,
      };
    }

    case "event": {
      const eventName = s(c.event);
      return {
        headline: eventName ? `Event "${eventName}"` : "Choose event...",
        isPlaceholder: !eventName,
        tags: [],
      };
    }

    case "emit_event": {
      const eventName = s(c.event);
      return {
        headline: eventName ? `Emit "${eventName}"` : "Choose event...",
        isPlaceholder: !eventName,
        tags: [],
      };
    }

    case "delay": {
      const amt = s(c.delay_amount) || "30";
      const unit = s(c.delay_unit) || "seconds";
      return {
        headline: `Wait ${amt} ${unit}`,
        tags: [],
      };
    }

    case "call_integration": {
      const op = s(c.operation);
      const opLabel = op ? op.replace(/_/g, " ").replace(/^\w/, (m) => m.toUpperCase()) : "";
      return {
        headline: opLabel || "Call Integration",
        tags: [],
      };
    }

    case "manual": {
      return {
        headline: "Manual run",
        tags: ["On button click"],
      };
    }

    default: {
      return {
        headline: blockLabel || kind,
        tags: [],
      };
    }
  }
}

export const BlockNode = memo(function BlockNode({ data, selected }: NodeProps<FlowNode>) {
  const block = blocks.findBlock(data.kind);
  const outPorts = block?.ports.out ?? [];
  const inPorts = block?.ports.in ?? [];
  const errorCount = data.errors ? Object.keys(data.errors).length : 0;
  const theme = getBlockTheme(data.kind);

  const content = getBlockDisplayContent(data.kind, data.config, block?.label ?? data.kind);
  const hasMultipleOutputs = outPorts.length > 1;

  return (
    <div
      data-testid={`block-node-${data.kind}`}
      className={`group relative min-w-[200px] max-w-[260px] rounded-lg border bg-white/95 p-2.5 shadow-sm backdrop-blur transition-all select-none cursor-pointer dark:bg-neutral-900/95 ${
        selected
          ? "border-lime-500 ring-2 ring-lime-500/40 shadow-lg shadow-lime-500/10 dark:border-lime-400 dark:ring-lime-400/30 dark:shadow-lime-400/10"
          : errorCount > 0
          ? "border-rose-500 ring-2 ring-rose-500/25 shadow-sm shadow-rose-500/10 dark:border-rose-400 dark:ring-rose-400/25"
          : "border-neutral-200/90 hover:border-neutral-300 hover:shadow-md dark:border-neutral-800 dark:hover:border-neutral-700"
      }`}
    >
      {/* Target handle (Input) */}
      {inPorts.length > 0 && (
        <Handle
          type="target"
          position={Position.Left}
          id="in"
          className="!h-2.5 !w-2.5 !-left-1.5 !border-2 !border-neutral-300 !bg-white hover:!border-lime-500 hover:!bg-lime-400 transition-colors dark:!border-neutral-600 dark:!bg-neutral-900 dark:hover:!border-lime-400 dark:hover:!bg-lime-400"
        />
      )}

      <div className="flex items-start gap-2.5">
        {/* Compact Icon */}
        <div
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-md border ${theme.badgeBg} ${theme.badgeBorder} ${theme.badgeIcon}`}
        >
          <BlockIcon kind={data.kind} className="h-3.5 w-3.5" />
        </div>

        {/* Info & Logic */}
        <div className="min-w-0 flex-1 pr-1">
          {/* Top Label & Error */}
          <div className="flex items-center justify-between gap-1 leading-none">
            <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
              {block?.label ?? data.kind}
            </span>

            {errorCount > 0 && (
              <span
                data-testid="block-error-badge"
                className="flex items-center gap-0.5 rounded bg-rose-50 px-1 py-0.5 text-[9px] font-bold text-rose-600 dark:bg-rose-950/80 dark:text-rose-300 shrink-0"
                title={`${errorCount} error(s)`}
              >
                <AlertTriangle className="h-2.5 w-2.5 stroke-[2.5]" />
                <span>{errorCount}</span>
              </span>
            )}
          </div>

          {/* Core Logic Statement */}
          <h3
            className={`mt-1 truncate text-xs font-bold leading-tight ${
              content.isPlaceholder
                ? "italic text-neutral-400 dark:text-neutral-500 font-normal"
                : "text-neutral-900 dark:text-neutral-100 font-mono"
            }`}
          >
            {content.headline}
          </h3>

          {/* Sub Tags */}
          {content.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {content.tags.map((tag, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center rounded bg-neutral-100 px-1 py-0.2 text-[9px] font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400 leading-tight"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Source handles (Output) */}
      {outPorts.map((port, index) => {
        const topPct = hasMultipleOutputs
          ? `${((index + 1) / (outPorts.length + 1)) * 100}%`
          : undefined;

        const isTrue = port === "true";
        const isFalse = port === "false";

        return (
          <React.Fragment key={port}>
            <Handle
              id={port}
              type="source"
              position={Position.Right}
              style={topPct ? { top: topPct } : undefined}
              className={`!h-2.5 !w-2.5 !-right-1.5 !border-2 transition-colors ${
                isTrue
                  ? "!border-emerald-500 !bg-emerald-50 hover:!bg-emerald-500 dark:!border-emerald-400 dark:!bg-neutral-900"
                  : isFalse
                  ? "!border-rose-500 !bg-rose-50 hover:!bg-rose-500 dark:!border-rose-400 dark:!bg-neutral-900"
                  : "!border-neutral-300 !bg-white hover:!border-lime-500 hover:!bg-lime-400 dark:!border-neutral-600 dark:!bg-neutral-900"
              }`}
            />
            {hasMultipleOutputs && (
              <span
                style={{ top: topPct }}
                className={`pointer-events-none absolute right-2.5 -translate-y-1/2 text-[9px] font-bold uppercase tracking-tight ${
                  isTrue ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {isTrue ? "yes" : "no"}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
});
