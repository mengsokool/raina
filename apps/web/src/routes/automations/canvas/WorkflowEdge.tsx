import React, { createContext, useContext, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
} from "@xyflow/react";
import { X } from "lucide-react";

export interface WorkflowEdgeData extends Record<string, unknown> {
  onDelete?: (id: string) => void;
  label?: string;
}

export const EdgeActionsContext = createContext<{
  deleteEdge: (id: string) => void;
} | null>(null);

export function WorkflowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
  sourceHandleId,
  label,
  data,
}: EdgeProps) {
  const [isHovered, setIsHovered] = useState(false);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const edgeData = data as WorkflowEdgeData | undefined;
  const port = sourceHandleId || (typeof label === "string" ? label : undefined);
  const isTrueBranch = port === "true" || port === "yes";
  const isFalseBranch = port === "false" || port === "no";

  const defaultColor = isTrueBranch
    ? "#10b981"
    : isFalseBranch
    ? "#f43f5e"
    : "#737373";

  const activeColor = isTrueBranch
    ? "#059669"
    : isFalseBranch
    ? "#e11d48"
    : "#84cc16";

  const isHighlighted = selected || isHovered;

  const strokeColor = isHighlighted ? activeColor : (style.stroke as string) || defaultColor;
  const strokeWidth = isHighlighted ? 3 : (style.strokeWidth as number) || 2;

  const edgeActions = useContext(EdgeActionsContext);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (edgeData?.onDelete) {
      edgeData.onDelete(id);
    } else if (edgeActions?.deleteEdge) {
      edgeActions.deleteEdge(id);
    }
  };

  const showControls = isHighlighted || Boolean(port && port !== "out");

  return (
    <>
      {/* Invisible wide hitbox for effortless clicking and hovering */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={24}
        className="cursor-pointer"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        data-testid={`edge-hitbox-${id}`}
      />

      {/* Visible edge line */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray: isFalseBranch ? "5 4" : undefined,
          filter: isHighlighted
            ? `drop-shadow(0 0 4px ${strokeColor}90)`
            : undefined,
          transition: "stroke 0.15s ease, stroke-width 0.15s ease",
        }}
      />

      {/* Interactive Delete Button and Port Label */}
      {showControls && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
            className="nodrag nopan flex items-center justify-center transition-all duration-150"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            {port && port !== "out" ? (
              <div
                className={`group/edge-badge inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-sm transition-all ${
                  isTrueBranch
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300"
                    : isFalseBranch
                    ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/80 dark:text-rose-300"
                    : "border-neutral-300 bg-white text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
                } ${isHighlighted ? "ring-2 ring-rose-400/50 shadow-md scale-105" : ""}`}
              >
                <span>{port}</span>
                <button
                  type="button"
                  data-testid={`delete-edge-button-${id}`}
                  onClick={handleDelete}
                  title="Delete connection"
                  aria-label={`Delete connection from port ${port}`}
                  className={`flex h-3.5 w-3.5 items-center justify-center rounded-full transition-colors ${
                    isHighlighted
                      ? "bg-rose-500 text-white hover:bg-rose-600 dark:bg-rose-600 dark:hover:bg-rose-500"
                      : "text-neutral-400 hover:bg-rose-100 hover:text-rose-600 dark:text-neutral-500 dark:hover:bg-rose-950 dark:hover:text-rose-300"
                  }`}
                >
                  <X className="h-2.5 w-2.5 stroke-[2.5]" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                data-testid={`delete-edge-button-${id}`}
                onClick={handleDelete}
                title="Delete connection"
                aria-label="Delete connection"
                className={`flex h-5 w-5 items-center justify-center rounded-full border shadow-md transition-all duration-150 ${
                  isHighlighted
                    ? "scale-110 border-rose-400 bg-rose-500 text-white hover:bg-rose-600 hover:scale-125 dark:border-rose-500 dark:bg-rose-600 dark:hover:bg-rose-500"
                    : "scale-90 border-neutral-300 bg-white text-neutral-500 hover:border-rose-400 hover:bg-rose-50 hover:text-rose-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-rose-400"
                }`}
              >
                <X className="h-3 w-3 stroke-[2.5]" />
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
