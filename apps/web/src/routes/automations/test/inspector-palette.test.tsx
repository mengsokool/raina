import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Inspector } from "../canvas/Inspector";
import { Palette } from "../canvas/Palette";
import { FlowNode } from "../canvas/BlockNode";

describe("Inspector Component Integration", () => {
  const dummyVariables = [
    { id: "v1", key: "temp_sensor", unit: "°C" },
    { id: "v2", key: "pump_status" },
  ];
  const dummyDevices = [{ id: "dev1", name: "Greenhouse ESP32" }];
  const dummyIntegrations = [
    { id: "int1", name: "Slack Alert", kind: "slack", enabled: true },
  ];

  it("renders block settings and fields for 'variable' trigger block", async () => {
    const node: FlowNode = {
      id: "node_123",
      type: "block",
      position: { x: 0, y: 0 },
      data: {
        kind: "variable",
        config: { variable: "temp_sensor", operator: ">", value: 25 },
      },
    };

    const update = vi.fn();
    const remove = vi.fn();
    const close = vi.fn();

    render(
      <Inspector
        node={node}
        variables={dummyVariables}
        devices={dummyDevices}
        integrations={dummyIntegrations}
        update={update}
        remove={remove}
        close={close}
      />
    );

    // Header checks
    expect(screen.getByRole("heading", { level: 2, name: "Variable" })).toBeInTheDocument();
    expect(screen.getByText(/ID: node_123/)).toBeInTheDocument();

    const user = userEvent.setup();

    // Variable select
    const varSelect = screen.getByTestId("inspector-input-variable");
    expect(varSelect).toHaveTextContent("temp_sensor");

    // Change variable
    await user.click(varSelect);
    const pumpOption = await screen.findByRole("option", { name: /pump_status/i });
    await user.click(pumpOption);
    expect(update).toHaveBeenCalledWith("variable", "pump_status");

    // Operator select
    const opSelect = screen.getByTestId("inspector-input-operator");
    await user.click(opSelect);
    const ltOption = await screen.findByRole("option", { name: "<" });
    await user.click(ltOption);
    expect(update).toHaveBeenCalledWith("operator", "<");

    // Numeric/Text value
    const valInput = screen.getByTestId("inspector-input-value") as HTMLInputElement;
    fireEvent.change(valInput, { target: { value: "30" } });
    expect(update).toHaveBeenCalledWith("value", "30");

    // Delete button
    const deleteBtn = screen.getByTestId("inspector-delete-node");
    fireEvent.click(deleteBtn);
    expect(remove).toHaveBeenCalled();
  });

  it("displays validation error messages in inspector", () => {
    const node: FlowNode = {
      id: "node_123",
      type: "block",
      position: { x: 0, y: 0 },
      data: {
        kind: "variable",
        config: { variable: "" },
        errors: { variable: "Variable is required" },
      },
    };

    render(
      <Inspector
        node={node}
        variables={dummyVariables}
        devices={dummyDevices}
        integrations={dummyIntegrations}
        update={vi.fn()}
        remove={vi.fn()}
        close={vi.fn()}
      />
    );

    expect(screen.getByTestId("inspector-error-variable")).toHaveTextContent(
      "Variable is required"
    );
  });

  it("handles weekday selection correctly for schedule block", () => {
    const node: FlowNode = {
      id: "sched_1",
      type: "block",
      position: { x: 0, y: 0 },
      data: {
        kind: "schedule",
        config: { time: "08:00", days: [1, 2] },
      },
    };

    const update = vi.fn();

    render(
      <Inspector
        node={node}
        variables={[]}
        devices={[]}
        integrations={[]}
        update={update}
        remove={vi.fn()}
        close={vi.fn()}
      />
    );

    // Monday (1) is currently selected; clicking it should deselect it
    const monBtn = screen.getByTestId("weekday-1");
    fireEvent.click(monBtn);
    expect(update).toHaveBeenCalledWith("days", [2]);

    // Wednesday (3) is not selected; clicking it should add it
    const wedBtn = screen.getByTestId("weekday-3");
    fireEvent.click(wedBtn);
    expect(update).toHaveBeenCalledWith("days", [1, 2, 3]);
  });
});

describe("Palette Component Integration", () => {
  it("renders catalog in grid and allows adding blocks", () => {
    const add = vi.fn();
    const setQuery = vi.fn();
    const close = vi.fn();

    render(<Palette query="" setQuery={setQuery} add={add} close={close} />);

    // Verify section headings
    expect(screen.getByText("TRIGGERS")).toBeInTheDocument();
    expect(screen.getByText("CONDITIONS")).toBeInTheDocument();
    expect(screen.getByText("ACTIONS")).toBeInTheDocument();

    // Click to add a block
    const addVarBtn = screen.getByTestId("palette-add-variable");
    fireEvent.click(addVarBtn);
    expect(add).toHaveBeenCalledWith("variable");
  });
});
