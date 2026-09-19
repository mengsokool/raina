import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { Inspector } from "../canvas/Inspector";
import { Palette, PaletteDrawer } from "../canvas/Palette";
import { FlowNode } from "../canvas/BlockNode";

describe("Inspector & Palette Interactions", () => {
  const node: FlowNode = {
    id: "node_123",
    type: "block",
    position: { x: 0, y: 0 },
    data: {
      kind: "variable",
      config: { variable: "temp", operator: ">", value: 25 },
    },
  };

  it("Inspector: opens directly on node select and has close (X) button", () => {
    const onClose = vi.fn();
    render(
      <Inspector
        node={node}
        variables={[]}
        devices={[]}
        integrations={[]}
        update={vi.fn()}
        remove={vi.fn()}
        close={onClose}
      />
    );

    expect(screen.getByTestId("inspector-panel")).toBeInTheDocument();

    const closeBtn = screen.getByRole("button", { name: "Close block inspector" });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Palette: clicking anywhere on the collapsed strip triggers expand", () => {
    const onToggle = vi.fn();
    render(
      <Palette
        query=""
        setQuery={vi.fn()}
        add={vi.fn()}
        close={vi.fn()}
        isCollapsed={true}
        onToggleCollapse={onToggle}
      />
    );

    const collapsedStrip = screen.getByTestId("palette-panel-collapsed");
    expect(collapsedStrip).toBeInTheDocument();

    // Clicking anywhere on the strip
    fireEvent.click(collapsedStrip);
    expect(onToggle).toHaveBeenCalledTimes(1);

    // Keyboard trigger
    fireEvent.keyDown(collapsedStrip, { key: " " });
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it("PaletteDrawer: renders mobile bottom sheet drawer and triggers add", () => {
    const onAdd = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <PaletteDrawer
        open={true}
        onOpenChange={onOpenChange}
        add={onAdd}
      />
    );

    expect(screen.getByTestId("palette-mobile-drawer")).toBeInTheDocument();
    expect(screen.getByText("Add block")).toBeInTheDocument();

    const addBtn = screen.getByTestId("palette-drawer-add-variable");
    fireEvent.click(addBtn);

    expect(onAdd).toHaveBeenCalledWith("variable");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
