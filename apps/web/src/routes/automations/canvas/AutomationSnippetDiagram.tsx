"use client";

import React, { useMemo } from "react";
import { blocks } from "@raina/workflow";

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
      <div className="flex h-20 w-full items-center justify-center rounded-sm border border-dashed border-border bg-muted/40 text-xs text-muted-foreground">
        No workflow steps defined
      </div>
    );
  }

  const nodeMap = new Map(layoutNodes.map((n) => [n.id, n]));

  return (
    <div
      onClick={onOpenEditor}
      title="Click to open full visual workflow editor"
      className="group relative w-full overflow-x-auto rounded-sm border border-border/80 bg-card/50 p-2 transition-colors hover:border-foreground/40 cursor-pointer select-none pointer-events-auto"
    >
      <svg
        viewBox={viewBox}
        className="h-28 max-h-35 w-full min-w-80 overflow-visible"
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
            <circle cx="2" cy="2" r="1" className="fill-muted-foreground/20" />
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
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" className="fill-muted-foreground" />
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
            ? "var(--color-primary, #84cc16)"
            : isFalseBranch
            ? "var(--color-destructive, #f43f5e)"
            : "var(--color-muted-foreground, #a3a3a3)";

          const midX = (startX + endX) / 2;
          const midY = (startY + endY) / 2;

              return (
                <path
                  key={`edge-${idx}`}
                  d={pathD}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth="1.75"
                  strokeDasharray={isFalseBranch ? "3 3" : undefined}
                  markerEnd="url(#arrow)"
                  className="opacity-70 group-hover:opacity-100 transition-opacity"
                />
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
            ? "stroke-info/50"
            : isCondition
            ? "stroke-chart-4/50"
            : "stroke-border";

          const bgColor = isTrigger
            ? "fill-info/10"
            : isCondition
            ? "fill-chart-4/10"
            : "fill-card";

          const labelColor = isTrigger
            ? "fill-info"
            : isCondition
            ? "fill-chart-4"
            : "fill-foreground";

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
                className={`text-xs font-semibold tracking-tight ${labelColor}`}
              >
                {manifest?.label || node.kind}
              </text>

              {/* Node Summary Subtitle */}
              {summaryText && (
                <text
                  x="12"
                  y="34"
                  className="text-xs fill-muted-foreground font-mono"
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
