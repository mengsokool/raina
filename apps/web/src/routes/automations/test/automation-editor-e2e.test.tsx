import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AutomationEditorContent } from "../canvas/AutomationEditor";

// Mock React Router navigation
const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("react-router", () => ({
  useParams: () => ({ proj: "demo-project" }),
  useNavigate: () => mockPush,
  useSearchParams: () => [mockSearchParams],
}));

// Mock @xyflow/react components and hooks for headless integration test
vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  return {
    ...actual,
    useReactFlow: () => ({
      fitView: vi.fn(),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      setCenter: vi.fn(),
      getZoom: () => 1,
      getNode: vi.fn(),
      screenToFlowPosition: () => ({ x: 200, y: 200 }),
    }),
    ReactFlow: ({
      children,
      nodes,
      edges = [],
      onNodeClick,
      onEdgeClick,
    }: any) => (
      <div data-testid="mock-react-flow">
        {nodes.map((node: any) => (
          <div
            key={node.id}
            data-testid={`canvas-node-${node.id}`}
            onClick={() => onNodeClick && onNodeClick({}, node)}
          >
            <span>{node.data.kind}</span>
            {node.data.errors && <span data-testid={`node-error-${node.id}`}>Error</span>}
          </div>
        ))}
        {edges.map((edge: any) => (
          <div
            key={edge.id}
            data-testid={`canvas-edge-${edge.id}`}
            onClick={() => onEdgeClick && onEdgeClick({}, edge)}
          >
            <span>{edge.id}</span>
          </div>
        ))}
        {children}
      </div>
    ),
    Background: () => null,
    MiniMap: () => null,
    Controls: () => null,
    Handle: () => null,
  };
});

describe("AutomationEditor Full User Flow & E2E Integration", () => {
  const dummyVariables = [{ id: "v1", key: "temp_sensor", unit: "°C" }];
  const dummyDevices = [{ id: "dev1", name: "Greenhouse ESP32" }];
  const dummyIntegrations = [{ id: "int1", name: "Slack", kind: "slack", enabled: true }];

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();

    // Mock global fetch
    global.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
      if (url.includes("/variables")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(dummyVariables) });
      }
      if (url.includes("/devices")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(dummyDevices) });
      }
      if (url.includes("/integrations")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(dummyIntegrations) });
      }
      if (url.includes("/automations") && opts?.method === "POST") {
        const body = JSON.parse(opts.body);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: "atm_new123", ...body }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    }) as any;
  });

  it("completes full flow: Load -> Add Node -> Configure via Inspector -> Save with Payload Verification", async () => {
    render(<AutomationEditorContent />);

    // 1. Verify Loading resolves
    await waitFor(() => {
      expect(screen.getByTestId("automation-name-input")).toBeInTheDocument();
    });

    // 2. Set Automation Name & Description
    const nameInput = screen.getByTestId("automation-name-input");
    fireEvent.change(nameInput, { target: { value: "Smart Temp Alert" } });
    expect(screen.getByTestId("save-status-indicator")).toHaveTextContent("Unsaved changes");

    // 3. Add a "variable" trigger node from Palette
    const addVarBtn = screen.getByTestId("palette-add-variable");
    fireEvent.click(addVarBtn);

    // Verify node is created in canvas
    const nodes = screen.getAllByText("variable");
    expect(nodes.length).toBeGreaterThan(0);

    // 4. Inspector should automatically open for newly created node
    expect(screen.getByTestId("inspector-panel")).toBeInTheDocument();

    const user = userEvent.setup();

    // Configure required 'variable' field
    const varSelect = screen.getByTestId("inspector-input-variable");
    await user.click(varSelect);
    const tempOption = await screen.findByRole("option", { name: /temp_sensor/i });
    await user.click(tempOption);

    // Configure operator and value
    const opSelect = screen.getByTestId("inspector-input-operator");
    await user.click(opSelect);
    const gteOption = await screen.findByRole("option", { name: ">=" });
    await user.click(gteOption);

    const valInput = screen.getByTestId("inspector-input-value");
    fireEvent.change(valInput, { target: { value: "35" } });

    // 5. Add an Action node (e.g. emit_event)
    const addEmitBtn = screen.getByTestId("palette-add-emit_event");
    fireEvent.click(addEmitBtn);

    // Configure the emit_event node
    const eventInput = screen.getByTestId("inspector-input-event");
    fireEvent.change(eventInput, { target: { value: "temp_high_alert" } });

    // 6. Trigger Save
    const saveBtn = screen.getByTestId("editor-save-button");
    fireEvent.click(saveBtn);

    // 7. Verify API call payload
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/v1\/(admin\/)?projects\/demo-project\/automations/),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"name":"Smart Temp Alert"'),
        })
      );
    });

    // Verify success toast appears
    await waitFor(() => {
      expect(screen.getByTestId("editor-toast-notice")).toHaveTextContent("Automation saved.");
    });
  });

  it("enforces validation on save: blocks with missing required fields show error toast & highlight", async () => {
    render(<AutomationEditorContent />);

    await waitFor(() => {
      expect(screen.getByTestId("automation-name-input")).toBeInTheDocument();
    });

    // Set name
    fireEvent.change(screen.getByTestId("automation-name-input"), {
      target: { value: "Incomplete Flow" },
    });

    // Add a variable block but DO NOT fill required 'variable' field
    fireEvent.click(screen.getByTestId("palette-add-variable"));

    // Attempt to save
    fireEvent.click(screen.getByTestId("editor-save-button"));

    // Should display validation error notice
    await waitFor(() => {
      expect(screen.getByTestId("editor-toast-notice")).toHaveTextContent(
        "Variable: Variable is required"
      );
    });

    // Should show error in inspector field
    expect(screen.getByTestId("inspector-error-variable")).toBeInTheDocument();
  });

  it("handles edge selection and deletion cleanly without deleting active blocks", async () => {
    render(<AutomationEditorContent />);

    await waitFor(() => {
      expect(screen.getByTestId("automation-name-input")).toBeInTheDocument();
    });

    // Add first block (variable)
    fireEvent.click(screen.getByTestId("palette-add-variable"));
    // Add second block (emit_event) which auto-connects to the first
    fireEvent.click(screen.getByTestId("palette-add-emit_event"));

    // Verify 2 nodes and 1 edge exist
    expect(screen.getByTestId("inspector-panel")).toBeInTheDocument();
    const edgeElements = screen.getAllByTestId(/^canvas-edge-/);
    expect(edgeElements.length).toBe(1);

    // Click on the edge to select it
    fireEvent.click(edgeElements[0]);

    // Inspector should close because selecting an edge unselects any active node
    expect(screen.queryByTestId("inspector-panel")).not.toBeInTheDocument();

    // Press Delete key on the window
    fireEvent.keyDown(window, { key: "Delete", code: "Delete" });

    // Edge should be removed
    expect(screen.queryAllByTestId(/^canvas-edge-/).length).toBe(0);

    // Both nodes should still exist!
    expect(screen.getAllByTestId(/^canvas-node-/).length).toBe(2);

    // Toast notice shows connection removed
    await waitFor(() => {
      expect(screen.getByTestId("editor-toast-notice")).toHaveTextContent("Connection removed.");
    });
  });

  it("opens palette drawer via mobile floating action button", async () => {
    render(<AutomationEditorContent />);

    await waitFor(() => {
      expect(screen.getByTestId("automation-name-input")).toBeInTheDocument();
    });

    const fabBtn = screen.getByTestId("mobile-add-block-fab");
    expect(fabBtn).toBeInTheDocument();

    fireEvent.click(fabBtn);

    // Palette mobile bottom drawer should open
    expect(await screen.findByTestId("palette-mobile-drawer")).toBeInTheDocument();
  });
});
