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

  const isHighlighted = selected || isHovered;

  const edgeClass = isTrueBranch
    ? isHighlighted
      ? "stroke-primary stroke-3"
      : "stroke-primary stroke-2"
    : isFalseBranch
    ? isHighlighted
      ? "stroke-destructive stroke-3 edge-dashed"
      : "stroke-destructive stroke-2 edge-dashed"
    : isHighlighted
    ? "stroke-primary stroke-3"
    : "stroke-muted-foreground stroke-2";

  const edgeActions = useContext(EdgeActionsContext);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (edgeData?.onDelete) {
      edgeData.onDelete(id);
    } else if (edgeActions?.deleteEdge) {
      edgeActions.deleteEdge(id);
    }
  };

  const showControls = isHighlighted;

  return (
    <>
      {/* Invisible wide hitbox for effortless tapping, clicking and hovering */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={32}
        className="cursor-pointer touch-manipulation"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        data-testid={`edge-hitbox-${id}`}
      />

      {/* Visible edge line */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        className={`${edgeClass} transition-all duration-150`}
      />

      {/* Interactive Delete Button */}
      {showControls && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            className="nodrag nopan flex items-center justify-center transition-all duration-150 touch-manipulation"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <button
              type="button"
              data-testid={`delete-edge-button-${id}`}
              onClick={handleDelete}
              title="Delete connection"
              aria-label="Delete connection"
              className="flex size-6 items-center justify-center rounded-full border border-destructive bg-destructive text-destructive-foreground shadow-md transition-all duration-150 hover:scale-115 active:scale-90 shadow-destructive/20 cursor-pointer"
            >
              <X className="size-3.5 stroke-2" />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
