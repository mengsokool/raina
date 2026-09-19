import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { Position } from "@xyflow/react";
import { WorkflowEdge, EdgeActionsContext } from "../canvas/WorkflowEdge";

// Mock @xyflow/react BaseEdge and EdgeLabelRenderer for headless testing
vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  return {
    ...actual,
    BaseEdge: ({ id, path, style }: any) => (
      <path data-testid={`mock-base-edge-${id}`} d={path} style={style} />
    ),
    EdgeLabelRenderer: ({ children }: any) => (
      <div data-testid="mock-edge-label-renderer">{children}</div>
    ),
  };
});

describe("WorkflowEdge component", () => {
  const defaultProps = {
    id: "edge-1",
    source: "node-a",
    target: "node-b",
    sourceX: 100,
    sourceY: 100,
    targetX: 300,
    targetY: 100,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  };

  it("renders wide invisible hitbox and base edge line", () => {
    render(
      <svg>
        <WorkflowEdge {...defaultProps} />
      </svg>
    );

    const hitbox = screen.getByTestId("edge-hitbox-edge-1");
    expect(hitbox).toBeInTheDocument();
    expect(hitbox).toHaveAttribute("stroke-width", "24");

    const baseEdge = screen.getByTestId("mock-base-edge-edge-1");
    expect(baseEdge).toBeInTheDocument();
  });

  it("reveals delete button when hovered over the hitbox", () => {
    render(
      <svg>
        <WorkflowEdge {...defaultProps} />
      </svg>
    );

    // Initially no delete button rendered when not hovered/selected
    expect(screen.queryByTestId("delete-edge-button-edge-1")).not.toBeInTheDocument();

    // Hover over hitbox
    const hitbox = screen.getByTestId("edge-hitbox-edge-1");
    fireEvent.mouseEnter(hitbox);

    // Delete button should now be visible
    const deleteBtn = screen.getByTestId("delete-edge-button-edge-1");
    expect(deleteBtn).toBeInTheDocument();

    // Mouse leave hides it
    fireEvent.mouseLeave(hitbox);
    expect(screen.queryByTestId("delete-edge-button-edge-1")).not.toBeInTheDocument();
  });

  it("reveals delete button when edge is selected", () => {
    render(
      <svg>
        <WorkflowEdge {...defaultProps} selected={true} />
      </svg>
    );

    const deleteBtn = screen.getByTestId("delete-edge-button-edge-1");
    expect(deleteBtn).toBeInTheDocument();
  });

  it("renders port label badge and delete button for conditional ports (true/false)", () => {
    render(
      <svg>
        <WorkflowEdge
          {...defaultProps}
          sourceHandleId="true"
          label="true"
        />
      </svg>
    );

    // Port badge is shown
    expect(screen.getByText("true")).toBeInTheDocument();
    const deleteBtn = screen.getByTestId("delete-edge-button-edge-1");
    expect(deleteBtn).toBeInTheDocument();
  });

  it("calls onDelete callback when delete button is clicked", () => {
    const onDelete = vi.fn();
    render(
      <svg>
        <WorkflowEdge
          {...defaultProps}
          selected={true}
          data={{ onDelete }}
        />
      </svg>
    );

    const deleteBtn = screen.getByTestId("delete-edge-button-edge-1");
    fireEvent.click(deleteBtn);

    expect(onDelete).toHaveBeenCalledWith("edge-1");
  });

  it("falls back to EdgeActionsContext.deleteEdge if edge data has no callback", () => {
    const deleteEdge = vi.fn();
    render(
      <EdgeActionsContext.Provider value={{ deleteEdge }}>
        <svg>
          <WorkflowEdge {...defaultProps} selected={true} />
        </svg>
      </EdgeActionsContext.Provider>
    );

    const deleteBtn = screen.getByTestId("delete-edge-button-edge-1");
    fireEvent.click(deleteBtn);

    expect(deleteEdge).toHaveBeenCalledWith("edge-1");
  });
});
