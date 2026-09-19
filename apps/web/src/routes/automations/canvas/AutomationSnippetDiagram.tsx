"use client";

import React, { useMemo } from "react";
import { blocks } from "@raina/workflow";
import { Zap, ArrowRight } from "lucide-react";

interface NodeData {
  id: string;
  kind: string;
  config?: Record<string, unknown>;
  x?: number;
  y?: number;
}

interface EdgeData {
  from: string;
  to: string;
  port?: string;
}

interface AutomationSnippetDiagramProps {
  graph?: {
    nodes?: NodeData[];
    edges?: EdgeData[];
  } | null;
  byIntegrationId?: Map<string, { name: string; kind: string }>;
  onOpenEditor?: () => void;
}

const NODE_WIDTH = 150;
const NODE_HEIGHT = 48;

export function AutomationSnippetDiagram({
  graph,
  byIntegrationId = new Map(),
  onOpenEditor,
}: AutomationSnippetDiagramProps) {
  const nodes = graph?.nodes || [];
  const edges = graph?.edges || [];

  const { layoutNodes, viewBox, width, height } = useMemo(() => {
    if (nodes.length === 0) {
      return { layoutNodes: [], viewBox: "0 0 300 100", width: 300, height: 100 };
    }

    // Assign positions if not present
    const hasCoordinates = nodes.some((n) => typeof n.x === "number" && n.x !== 0);

    const mapped = nodes.map((node, i) => {
      let nx = typeof node.x === "number" && hasCoordinates ? node.x : 40 + i * 200;
      let ny = typeof node.y === "number" && hasCoordinates ? node.y : 40;
      return {
        ...node,
        computedX: nx,
        computedY: ny,
      };
    });

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    mapped.forEach((n) => {
      if (n.computedX < minX) minX = n.computedX;
      if (n.computedY < minY) minY = n.computedY;
      if (n.computedX + NODE_WIDTH > maxX) maxX = n.computedX + NODE_WIDTH;
      if (n.computedY + NODE_HEIGHT > maxY) maxY = n.computedY + NODE_HEIGHT;
    });

    const padding = 30;
    const w = Math.max(320, maxX - minX + padding * 2);
    const h = Math.max(100, maxY - minY + padding * 2);

    // Normalize nodes so top-left starts at padding
    const normalized = mapped.map((n) => ({
      ...n,
      renderX: n.computedX - minX + padding,
      renderY: n.computedY - minY + padding,
    }));

    return {
      layoutNodes: normalized,
      viewBox: `0 0 ${w} ${h}`,
      width: w,
      height: h,
    };
  }, [nodes]);

  if (nodes.length === 0) {
    return (
      <div className="flex h-20 w-full items-center justify-center rounded-sm border border-dashed border-neutral-200 bg-neutral-50 text-xs text-neutral-400 dark:border-neutral-800 dark:bg-neutral-950/40">
        No workflow steps defined
      </div>
    );
  }

  const nodeMap = new Map(layoutNodes.map((n) => [n.id, n]));

  return (
    <div
      onClick={onOpenEditor}
      title="Click to open full visual workflow editor"
      className="group relative w-full overflow-x-auto rounded-sm border border-neutral-200/80 bg-neutral-50/50 p-2 transition-colors hover:border-neutral-300 dark:border-neutral-800/80 dark:bg-neutral-950/60 dark:hover:border-neutral-700 cursor-pointer select-none"
    >
      <svg
        viewBox={viewBox}
        className="h-28 w-full min-w-[320px] overflow-visible"
        style={{ maxHeight: "140px" }}
      >
        <defs>
          <pattern
            id="diagram-dots"
            x="0"
            y="0"
            width="16"
            height="16"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2" cy="2" r="1" className="fill-neutral-300/40 dark:fill-neutral-800/60" />
          </pattern>

          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" className="fill-neutral-400 dark:fill-neutral-500" />
          </marker>
        </defs>

        {/* Dotted Background */}
        <rect width={width} height={height} fill="url(#diagram-dots)" rx="4" />

        {/* Connecting Edges */}
        {edges.map((edge, idx) => {
          const source = nodeMap.get(edge.from);
          const target = nodeMap.get(edge.to);
          if (!source || !target) return null;

          const startX = source.renderX + NODE_WIDTH;
          const startY = source.renderY + NODE_HEIGHT / 2;
          const endX = target.renderX;
          const endY = target.renderY + NODE_HEIGHT / 2;

          const dx = Math.abs(endX - startX) * 0.5;
          const pathD = `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`;

          const isTrueBranch = edge.port === "true" || edge.port === "yes";
          const isFalseBranch = edge.port === "false" || edge.port === "no";
          const strokeColor = isTrueBranch
            ? "#10b981"
            : isFalseBranch
            ? "#f43f5e"
            : "#a3a3a3";

          const midX = (startX + endX) / 2;
          const midY = (startY + endY) / 2;

          return (
            <g key={`edge-${idx}`}>
              <path
                d={pathD}
                fill="none"
                stroke={strokeColor}
                strokeWidth="1.75"
                strokeDasharray={isFalseBranch ? "3 3" : undefined}
                markerEnd="url(#arrow)"
                className="opacity-70 group-hover:opacity-100 transition-opacity"
              />
              {edge.port && edge.port !== "out" && (
                <g transform={`translate(${midX - 16}, ${midY - 8})`}>
                  <rect
                    width="32"
                    height="16"
                    rx="3"
                    className={`text-[9px] font-mono font-semibold ${
                      isTrueBranch
                        ? "fill-emerald-950 stroke-emerald-600"
                        : isFalseBranch
                        ? "fill-rose-950 stroke-rose-600"
                        : "fill-neutral-900 stroke-neutral-700"
                    }`}
                    strokeWidth="1"
                  />
                  <text
                    x="16"
                    y="11.5"
                    textAnchor="middle"
                    className={`text-[9px] font-mono font-bold ${
                      isTrueBranch
                        ? "fill-emerald-400"
                        : isFalseBranch
                        ? "fill-rose-400"
                        : "fill-neutral-300"
                    }`}
                  >
                    {edge.port}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {layoutNodes.map((node) => {
          const manifest = blocks.findBlock(node.kind);
          const category = manifest?.category || "action";

          const lines = blocks.blockLines(
            node.kind,
            node.config ?? {},
            {
              integration: (id) => {
                const integration = byIntegrationId.get(id);
                return integration
                  ? { name: integration.name, kindLabel: integration.kind }
                  : undefined;
              },
            }
          );

          const summaryText = lines[0] || "";

          const isTrigger = category === "trigger";
          const isCondition = category === "condition";

          const borderColor = isTrigger
            ? "stroke-orange-500/60 dark:stroke-orange-500/50"
            : isCondition
            ? "stroke-amber-500/60 dark:stroke-amber-500/50"
            : "stroke-neutral-300 dark:stroke-neutral-700";

          const bgColor = isTrigger
            ? "fill-orange-50/80 dark:fill-orange-950/40"
            : isCondition
            ? "fill-amber-50/80 dark:fill-amber-950/40"
            : "fill-white dark:fill-neutral-900";

          const labelColor = isTrigger
            ? "fill-orange-900 dark:fill-orange-200"
            : isCondition
            ? "fill-amber-900 dark:fill-amber-200"
            : "fill-neutral-900 dark:fill-neutral-100";

          return (
            <g
              key={node.id}
              transform={`translate(${node.renderX}, ${node.renderY})`}
              className="transition-transform"
            >
              {/* Node Card Box */}
              <rect
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx="4"
                className={`${bgColor} ${borderColor}`}
                strokeWidth="1.25"
              />

              {/* Node Label */}
              <text
                x="12"
                y="19"
                className={`text-[11px] font-semibold tracking-tight ${labelColor}`}
              >
                {manifest?.label || node.kind}
              </text>

              {/* Node Summary Subtitle */}
              {summaryText && (
                <text
                  x="12"
                  y="34"
                  className="text-[9px] fill-neutral-500 dark:fill-neutral-400 font-mono"
                >
                  {summaryText.length > 22
                    ? `${summaryText.slice(0, 20)}…`
                    : summaryText}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
