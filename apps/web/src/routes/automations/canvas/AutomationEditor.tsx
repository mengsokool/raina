import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Connection,
  ConnectionLineType,
  Controls,
  Edge,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  LoaderCircle,
  Play,
  Plus,
  Redo2,
  Save,
  Sparkles,
  Undo2,
} from "lucide-react";
import { Automation, blocks } from "@raina/workflow";
import {
  listVariables,
  listDevices,
  listIntegrations,
  createAutomation,
  generateAutomationDraft,
  listAutomations,
  runAutomation,
  updateAutomation,
} from "@/lib/api-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BlockNode, FlowNode } from "./BlockNode";
import { WorkflowEdge, EdgeActionsContext } from "./WorkflowEdge";
import { Palette, PaletteDrawer } from "./Palette";
import { ComposePanel } from "./ComposePanel";
import { Inspector } from "./Inspector";
import {
  Variable,
  Device,
  Integration,
  Notice,
  validateBlockConfig,
  validateAllBlocks,
} from "../utils/types";
import {
  Graph,
  toFlow,
  toGraph,
  reaches,
  edgeId,
  defaultConfig,
} from "../utils/graph-utils";

const recipes: Record<string, { name: string; description: string; graph: Graph }> = {
  "freezer-guard": {
    name: "Freezer guard",
    description: "Protect stored stock when the freezer warms up.",
    graph: {
      nodes: [
        {
          id: "temperature",
          kind: "variable",
          config: {
            variable: "freezer_temp",
            operator: ">",
            value: -5,
            mode: "edge",
            cooldown_seconds: 300,
          },
          x: 80,
          y: 180,
        },
        {
          id: "critical",
          kind: "if_variable",
          config: { variable: "freezer_temp", operator: ">", value: 0 },
          x: 360,
          y: 180,
        },
        {
          id: "alarm",
          kind: "set_variable",
          config: { variable: "alarm", value: 1 },
          x: 640,
          y: 80,
        },
        {
          id: "alert",
          kind: "emit_event",
          config: { event: "freezer_critical" },
          x: 920,
          y: 80,
        },
        {
          id: "compressor",
          kind: "set_variable",
          config: { variable: "compressor", value: 1 },
          x: 640,
          y: 300,
        },
      ],
      edges: [
        { from: "temperature", to: "critical" },
        { from: "critical", to: "alarm", port: "true" },
        { from: "alarm", to: "alert" },
        { from: "critical", to: "compressor", port: "false" },
      ],
    },
  },
  "morning-startup": {
    name: "Morning startup",
    description: "Weekday routine for lights and HVAC.",
    graph: {
      nodes: [
        {
          id: "schedule",
          kind: "schedule",
          config: { time: "07:00", days: [1, 2, 3, 4, 5], tz: "Asia/Bangkok" },
          x: 80,
          y: 180,
        },
        {
          id: "lights",
          kind: "set_variable",
          config: { variable: "lights", value: "on" },
          x: 360,
          y: 180,
        },
        {
          id: "hvac",
          kind: "set_variable",
          config: { variable: "hvac_setpoint", value: 21 },
          x: 640,
          y: 180,
        },
        {
          id: "event",
          kind: "emit_event",
          config: { event: "morning_routine" },
          x: 920,
          y: 180,
        },
      ],
      edges: [
        { from: "schedule", to: "lights" },
        { from: "lights", to: "hvac" },
        { from: "hvac", to: "event" },
      ],
    },
  },
  "dusk-to-dawn": {
    name: "Dusk-to-dawn lights",
    description: "Turn exterior lights on at sunset, and off at sunrise.",
    graph: {
      nodes: [
        {
          id: "dusk",
          kind: "sunset_sunrise",
          config: { event: "sunset", lat: 0, lng: 0, offset_minutes: 0 },
          x: 80,
          y: 100,
        },
        {
          id: "lights-on",
          kind: "set_variable",
          config: { variable: "outdoor_lights", value: "on" },
          x: 380,
          y: 100,
        },
        {
          id: "dawn",
          kind: "sunset_sunrise",
          config: { event: "sunrise", lat: 0, lng: 0, offset_minutes: 0 },
          x: 80,
          y: 330,
        },
        {
          id: "lights-off",
          kind: "set_variable",
          config: { variable: "outdoor_lights", value: "off" },
          x: 380,
          y: 330,
        },
      ],
      edges: [
        { from: "dusk", to: "lights-on" },
        { from: "dawn", to: "lights-off" },
      ],
    },
  },
};

const nodeTypes = { block: BlockNode };
const edgeTypes = {
  workflow: WorkflowEdge,
  smoothstep: WorkflowEdge,
  default: WorkflowEdge,
};
const nodeId = () => `node_${crypto.randomUUID().slice(0, 8)}`;

const isInput = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable);

export function AutomationEditorContent() {
  const { proj = "" } = useParams<{ proj: string }>();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const automationId = search.get("id");
  const recipeId = search.get("recipe");
  const startInCompose = search.get("compose") === "1";

  const { fitView, screenToFlowPosition, setCenter, getZoom, getNode } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [variables, setVariables] = useState<Variable[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [baseline, setBaseline] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [future, setFuture] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(startInCompose);
  const [composePrompt, setComposePrompt] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);
  const [replacement, setReplacement] = useState<"example" | "generate">("example");
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isExampleDraft, setIsExampleDraft] = useState(false);
  const [aiReview, setAiReview] = useState<Array<{ nodeId?: string; label: string; detail: string; needsReview: boolean }>>([]);
  const requestVersion = useRef(0);

  const selected = nodes.find((node) => node.id === selectedId) ?? null;

  const snapshot = useCallback(
    () => JSON.stringify({ name, description, graph: toGraph(nodes, edges) }),
    [name, description, nodes, edges]
  );

  const dirty = !loading && snapshot() !== baseline;

  const commitHistory = useCallback(() => {
    setHistory((current) => [...current.slice(-29), snapshot()]);
    setFuture([]);
  }, [snapshot]);

  const restore = useCallback(
    (raw: string) => {
      const state = JSON.parse(raw) as { name: string; description: string; graph: Graph };
      const flow = toFlow(state.graph);
      setName(state.name);
      setDescription(state.description);
      setNodes(flow.nodes);
      setEdges(flow.edges);
      setSelectedId(null);
    },
    [setEdges, setNodes]
  );

  const initialise = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [variablesData, devicesData, integrationsData, automationsData] = await Promise.all([
        listVariables(proj),
        listDevices(proj),
        listIntegrations(proj),
        automationId ? listAutomations(proj) : Promise.resolve(null),
      ]);

      setVariables(variablesData as any);
      setDevices(devicesData as any);
      setIntegrations(integrationsData as any);

      let next = { name: "", description: "", graph: { nodes: [], edges: [] } as Graph };

      if (automationId && automationsData) {
        const automations = automationsData as Automation[];
        const automation = automations.find((item) => item.id === automationId);
        if (!automation) throw new Error("This automation no longer exists.");
        next = {
          name: automation.name,
          description: automation.description ?? "",
          graph:
            automation.graph?.nodes?.length
              ? automation.graph
              : blocks.buildLinearGraph(
                  automation.trigger_type,
                  (automation.trigger_config as Record<string, unknown>) ?? {},
                  automation.actions
                ),
        };
      } else if (recipeId) {
        const recipe = recipes[recipeId];
        if (!recipe) throw new Error("That automation recipe does not exist.");
        next = recipe;
      } else {
        next = {
          name: "Untitled automation",
          description: "",
          graph: {
            nodes: [],
            edges: [],
          },
        };
      }

      const flow = toFlow(next.graph);
      setName(next.name);
      setDescription(next.description);
      setNodes(flow.nodes);
      setEdges(flow.edges);
      setBaseline(JSON.stringify(next));
      setHistory([]);
      setFuture([]);
      setPreviewMode(false);
      setAiReview([]);
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : "We could not load the editor.");
    } finally {
      setLoading(false);
    }
  }, [automationId, proj, recipeId, setEdges, setNodes]);

  useEffect(() => {
    void initialise();
  }, [initialise]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const navigateBack = () => {
    if (dirty) {
      setConfirmDiscardOpen(true);
    } else {
      navigate(`/p/${proj}/automations`);
    }
  };

  const focusNode = useCallback(
    (targetNode: FlowNode | { id?: string; position: { x: number; y: number } }) => {
      const liveNode = (targetNode.id ? getNode(targetNode.id) : null) ?? targetNode;
      const nodeWidth = (liveNode as any).measured?.width ?? 240;
      const nodeHeight = (liveNode as any).measured?.height ?? 80;
      const nodeCenterX = liveNode.position.x + nodeWidth / 2;
      const nodeCenterY = liveNode.position.y + nodeHeight / 2;

      const currentZoom = getZoom ? getZoom() : 1;
      const zoom = currentZoom > 0 ? currentZoom : 1;
      const isMobile = window.innerWidth < 1024;

      let deltaX = 0;
      let deltaY = 0;

      if (isMobile) {
        // Mobile bottom drawer occupies the lower ~60-65% of the viewport.
        // We want the block positioned cleanly in the middle of the upper ~35-40% visible area.
        const headerHeight = 56;
        const visibleTop = headerHeight;
        const visibleBottom = window.innerHeight * 0.38;
        const targetScreenY = (visibleTop + visibleBottom) / 2;
        deltaY = (window.innerHeight / 2 - targetScreenY) / zoom;
      } else {
        // Desktop has left palette sidebar and right inspector panel.
        const leftWidth = paletteCollapsed ? 48 : 256;
        const rightWidth = 352;
        const visibleLeft = leftWidth;
        const visibleRight = window.innerWidth - rightWidth;
        const targetScreenX = (visibleLeft + visibleRight) / 2;
        deltaX = (window.innerWidth / 2 - targetScreenX) / zoom;
      }

      window.requestAnimationFrame(() => {
        void setCenter(nodeCenterX + deltaX, nodeCenterY + deltaY, {
          zoom,
          duration: 350,
        });
      });
    },
    [getNode, getZoom, paletteCollapsed, setCenter]
  );

  const addBlock = (kind: string) => {
    const manifest = blocks.findBlock(kind);
    if (!manifest) return;
    commitHistory();

    const reference = selected ?? nodes[nodes.length - 1];
    let position = { x: 100, y: 150 };

    if (reference) {
      position = {
        x: reference.position.x + 280,
        y: reference.position.y + (manifest.category === "condition" ? 90 : 0),
      };
    } else {
      try {
        position = screenToFlowPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        });
      } catch {
        position = { x: 120, y: 120 };
      }
    }

    const cfg = defaultConfig(kind);
    const errs = validateBlockConfig(kind, cfg);

    const node: FlowNode = {
      id: nodeId(),
      type: "block",
      position,
      selected: true,
      data: {
        kind,
        config: cfg,
        errors: Object.keys(errs).length > 0 ? errs : undefined,
      },
    };

    setNodes((current) => [
      ...current.map((n) => (n.selected ? { ...n, selected: false } : n)),
      node,
    ]);

    if (reference) {
      const port = blocks.findBlock(reference.data.kind)?.ports.out?.[0];
      if (port && manifest.ports.in?.length) {
        setEdges((current) => [
          ...current,
          {
            id: edgeId({ from: reference.id, to: node.id, port }),
            source: reference.id,
            target: node.id,
            sourceHandle: port,
            type: "workflow",
            label: port !== "out" ? port : undefined,
          },
        ]);
      }
    }

    setSelectedId(node.id);
    setSidebarOpen(false);
    focusNode(node);
  };

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const kind = event.dataTransfer.getData("application/reactflow");
      if (!kind) return;

      const manifest = blocks.findBlock(kind);
      if (!manifest) return;
      commitHistory();

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const cfg = defaultConfig(kind);
      const errs = validateBlockConfig(kind, cfg);

      const node: FlowNode = {
        id: nodeId(),
        type: "block",
        position,
        selected: true,
        data: {
          kind,
          config: cfg,
          errors: Object.keys(errs).length > 0 ? errs : undefined,
        },
      };

      setNodes((current) => [
        ...current.map((n) => (n.selected ? { ...n, selected: false } : n)),
        node,
      ]);
      setSelectedId(node.id);
      focusNode(node);
    },
    [commitHistory, focusNode, screenToFlowPosition, setNodes]
  );

  const onConnect = (connection: Connection) => {
    if (
      !connection.source ||
      !connection.target ||
      connection.source === connection.target ||
      reaches(edges, connection.target, connection.source)
    ) {
      setNotice({ kind: "error", message: "That connection would create an invalid loop." });
      return;
    }

    const exists = edges.some(
      (edge) =>
        edge.source === connection.source &&
        edge.target === connection.target &&
        (edge.sourceHandle ?? "out") === (connection.sourceHandle ?? "out")
    );
    if (exists) return;

    commitHistory();
    setEdges((current) =>
      addEdge(
        {
          ...connection,
          id: edgeId({
            from: connection.source!,
            to: connection.target!,
            port: connection.sourceHandle ?? "out",
          }),
          type: "workflow",
          label:
            connection.sourceHandle && connection.sourceHandle !== "out"
              ? connection.sourceHandle
              : undefined,
        },
        current
      )
    );
  };

  const validConnection = (connection: Connection | Edge) =>
    Boolean(
      connection.source &&
        connection.target &&
        connection.source !== connection.target &&
        !reaches(edges, connection.target, connection.source)
    );

  const updateConfig = (key: string, value: unknown) => {
    if (!selectedId) return;

    setNodes((current) =>
      current.map((node) => {
        if (node.id !== selectedId) return node;
        const newConfig = { ...node.data.config, [key]: value };
        const newErrors = validateBlockConfig(node.data.kind, newConfig);
        return {
          ...node,
          data: {
            ...node.data,
            config: newConfig,
            errors: Object.keys(newErrors).length > 0 ? newErrors : undefined,
          },
        };
      })
    );
  };

  const deleteEdge = useCallback(
    (edgeIdToDelete: string) => {
      commitHistory();
      setEdges((current) => current.filter((edge) => edge.id !== edgeIdToDelete));
      setNotice({ kind: "info", message: "Connection removed." });
    },
    [commitHistory, setEdges]
  );

  const deleteSelection = useCallback(() => {
    const selectedEdgeIds = edges.filter((edge) => edge.selected).map((edge) => edge.id);
    if (!selectedId && !selectedEdgeIds.length) return;

    commitHistory();

    if (selectedId) {
      setNodes((current) => current.filter((node) => node.id !== selectedId));
      setEdges((current) =>
        current.filter((edge) => edge.source !== selectedId && edge.target !== selectedId)
      );
      setSelectedId(null);
    } else if (selectedEdgeIds.length > 0) {
      setEdges((current) => current.filter((edge) => !selectedEdgeIds.includes(edge.id)));
      setNotice({
        kind: "info",
        message: selectedEdgeIds.length > 1 ? "Connections removed." : "Connection removed.",
      });
    }
  }, [commitHistory, edges, selectedId, setEdges, setNodes]);

  const undo = useCallback(() => {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture((current) => [snapshot(), ...current]);
    setHistory((current) => current.slice(0, -1));
    restore(previous);
  }, [history, restore, snapshot]);

  const redo = useCallback(() => {
    const next = future[0];
    if (!next) return;
    setHistory((current) => [...current, snapshot()]);
    setFuture((current) => current.slice(1));
    restore(next);
  }, [future, restore, snapshot]);

  const previewExample = () => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const graph: Graph = {
      nodes: [
        { id: nodeId(), kind: "schedule", config: { time: "08:00", days: [], tz: timezone }, x: 80, y: 160 },
        { id: nodeId(), kind: "emit_event", config: { event: "daily_check" }, x: 370, y: 160 },
      ],
      edges: [],
    };
    graph.edges.push({ from: graph.nodes[0].id, to: graph.nodes[1].id, port: "out" });
    commitHistory();
    const flow = toFlow(graph);
    setNodes(flow.nodes);
    setEdges(flow.edges);
    setName("Daily check");
    setDescription(`Example draft: emit a daily_check event every day at 08:00 (${timezone}).`);
    setSelectedId(null);
    setPreviewMode(true);
    setIsExampleDraft(true);
    setAiReview([]);
    setGenerationError(null);
    if (window.innerWidth < 1024) setComposeOpen(false);
    window.requestAnimationFrame(() => void fitView({ padding: 0.3, duration: 200 }));
  };

  const requestExamplePreview = () => {
    if (nodes.length > 0) { setReplacement("example"); setConfirmReplaceOpen(true); }
    else previewExample();
  };

  const createGeneratedDraft = async () => {
    const version = ++requestVersion.current;
    const submittedPrompt = composePrompt.trim();
    setGenerating(true);
    setGenerationError(null);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const draft = await generateAutomationDraft(proj, submittedPrompt, timezone);
      if (version !== requestVersion.current) return;
      commitHistory();
      const flow = toFlow(draft.graph);
      setNodes(flow.nodes);
      setEdges(flow.edges);
      setName(draft.name);
      setDescription("");
      setAiReview(draft.reviewItems);
      setSelectedId(null);
      setPreviewMode(true);
      setIsExampleDraft(false);
      if (window.innerWidth < 1024) setComposeOpen(false);
      window.requestAnimationFrame(() => void fitView({ padding: 0.3, duration: 200 }));
    } catch (caught) {
      if (version !== requestVersion.current) return;
      setGenerationError(caught instanceof Error ? caught.message : "Could not generate a draft.");
    } finally {
      if (version === requestVersion.current) setGenerating(false);
    }
  };

  const requestGeneration = () => {
    if (nodes.length > 0) { setReplacement("generate"); setConfirmReplaceOpen(true); }
    else void createGeneratedDraft();
  };

  const reviewSteps = (aiReview.length ? aiReview : nodes.map((node) => {
    const spec = blocks.findBlock(node.data.kind);
    const errors = validateBlockConfig(node.data.kind, node.data.config);
    const detail = node.data.kind === "schedule"
      ? `Every day at ${String(node.data.config.time ?? "08:00")} · ${String(node.data.config.tz ?? "UTC")}`
      : node.data.kind === "emit_event"
        ? `Emit ${String(node.data.config.event ?? "an event")}`
        : spec?.category === "trigger"
      ? "When this event occurs"
      : spec?.category === "condition"
        ? "Check before continuing"
        : "Then perform this action";
    return {
      nodeId: node.id,
      label: spec?.label ?? node.data.kind,
      detail: Object.values(errors)[0] ?? detail,
      needsReview: Object.keys(errors).length > 0,
    };
  })).map((item) => {
    if (!item.nodeId) return { ...item, id: `review_${item.label}` };
    const node = nodes.find((candidate) => candidate.id === item.nodeId);
    const errors = node ? validateBlockConfig(node.data.kind, node.data.config) : {};
    return { ...item, id: item.nodeId, detail: Object.values(errors)[0] ?? item.detail, needsReview: item.needsReview || Object.keys(errors).length > 0 };
  });

  const save = async () => {
    if (saving) return;

    const graph = toGraph(nodes, edges);
    const structError = blocks.graphError(graph);
    if (structError) {
      setNotice({ kind: "error", message: structError });
      return;
    }

    if (!name.trim()) {
      setNotice({ kind: "error", message: "Give this automation a name before saving." });
      return;
    }

    // Validate block fields
    const blockErrors = validateAllBlocks(nodes);
    if (blockErrors.size > 0) {
      // update nodes state with latest error highlights
      setNodes((current) =>
        current.map((n) => {
          const errs = blockErrors.get(n.id);
          return {
            ...n,
            data: {
              ...n.data,
              errors: errs && Object.keys(errs).length > 0 ? errs : undefined,
            },
          };
        })
      );
      const firstErrorNode = nodes.find((n) => blockErrors.has(n.id));
      if (firstErrorNode) {
        setSelectedId(firstErrorNode.id);
        focusNode(firstErrorNode);
        const firstErrMsg = Object.values(blockErrors.get(firstErrorNode.id)!)[0];
        setNotice({
          kind: "error",
          message: `${blocks.findBlock(firstErrorNode.data.kind)?.label ?? "Block"}: ${firstErrMsg}`,
        });
      }
      return;
    }

    setSaving(true);
    try {
      const trigger = graph.nodes.find(
        (node) => blocks.findBlock(node.kind)?.category === "trigger"
      );
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        trigger_type: trigger?.kind ?? "manual",
        graph: graph as any,
        ...(!automationId && previewMode ? { enabled: false } : {}),
      };

      let savedId = automationId;
      if (automationId) {
        await updateAutomation(proj, automationId, payload);
      } else {
        const created = await createAutomation(proj, payload);
        savedId = created.id;
      }

      setBaseline(snapshot());
      setNotice({ kind: "success", message: previewMode && !automationId ? "Draft saved. Turn it on when you're ready." : "Automation saved." });
      if (!automationId && savedId) {
        navigate(`/p/${proj}/automations/editor?id=${savedId}`, { replace: true });
      }
    } catch (caught) {
      setNotice({
        kind: "error",
        message: caught instanceof Error ? caught.message : "Could not save automation.",
      });
    } finally {
      setSaving(false);
    }
  };

  const testRun = async () => {
    if (!automationId) {
      setNotice({ kind: "info", message: "Save the automation before running a test." });
      return;
    }
    if (dirty) {
      await save();
    }
    setRunning(true);
    try {
      const data = await runAutomation(proj, automationId, { payload: { isManual: true } });
      if (data.status === "error") {
        setNotice({
          kind: "error",
          message: data.error || "Automation test run failed.",
        });
      } else {
        setNotice({
          kind: "success",
          message: `Ran successfully! (${data.stepsExecuted || 1} steps executed)`,
        });
      }
    } catch (err: any) {
      setNotice({ kind: "error", message: err.message || "Failed to trigger run." });
    } finally {
      setRunning(false);
    }
  };

  // Keyboard shortcuts listener
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isInput(event.target)) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelection();
      } else if (event.key === "Escape") {
        setSelectedId(null);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [deleteSelection, redo, undo, save]);

  if (loadError) {
    return <EditorError message={loadError} retry={initialise} back={navigateBack} />;
  }

  return (
    <div
      data-testid="automation-editor-root"
      className="flex h-full w-full overflow-hidden bg-background text-foreground"
    >
      {/* Desktop Sidebar Palette */}
      {!composeOpen && <aside
        data-testid="palette-sidebar"
        className={`hidden lg:flex flex-col border-r border-border bg-card transition-all duration-200 ${
          paletteCollapsed ? "w-12" : "w-64"
        }`}
      >
        <Palette
          query={paletteQuery}
          setQuery={setPaletteQuery}
          add={addBlock}
          close={() => {}}
          isCollapsed={paletteCollapsed}
          onToggleCollapse={() => setPaletteCollapsed((prev) => !prev)}
        />
      </aside>}

      {composeOpen && (
        <>
          <button
            type="button"
            aria-label="Close workflow composer"
            onClick={() => setComposeOpen(false)}
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          />
          <ComposePanel
            prompt={composePrompt}
            onPromptChange={(value) => { requestVersion.current++; setComposePrompt(value); setGenerating(false); setGenerationError(null); }}
            onClose={() => setComposeOpen(false)}
            onPreview={requestExamplePreview}
            onGenerate={requestGeneration}
            reviewSteps={reviewSteps}
            onSelectStep={(id) => {
              const node = nodes.find((item) => item.id === id);
              if (!node) return;
              setSelectedId(id);
              setNodes((current) => current.map((item) => ({ ...item, selected: item.id === id })));
              if (window.innerWidth < 1024) setComposeOpen(false);
              focusNode(node);
            }}
            hasDraft={previewMode}
            isExample={isExampleDraft}
            generating={generating}
            error={generationError}
          />
        </>
      )}

      {/* Mobile Bottom Sheet Drawer for adding blocks */}
      <PaletteDrawer
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        add={addBlock}
      />

      {/* Main Canvas Area */}
      <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top Navbar */}
        <header
          data-testid="editor-header"
          className="z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 sm:px-5"
        >
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={navigateBack}
              className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-label="Back to automations"
            >
              <ArrowLeft className="size-4" />
            </button>

            <div className="min-w-0">
              <input
                data-testid="automation-name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Untitled automation"
                aria-label="Automation name"
                className="block w-full max-w-xs truncate bg-transparent text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground focus:text-foreground"
              />
              <input
                data-testid="automation-desc-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a description"
                aria-label="Automation description"
                className="mt-0.5 block w-full max-w-sm truncate bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground focus:text-foreground"
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              data-testid="editor-compose-button"
              onClick={() => setComposeOpen((current) => !current)}
              aria-pressed={composeOpen}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
              <span className="hidden sm:inline">Describe</span>
              <span className="sr-only sm:hidden">Describe workflow</span>
            </button>
            <span
              data-testid="save-status-indicator"
              className={`hidden text-xs sm:inline font-medium ${
                dirty ? "text-warning" : "text-muted-foreground"
              }`}
            >
              {dirty ? "Unsaved changes" : "Saved"}
            </span>

            {/* Undo / Redo */}
            <div className="hidden sm:flex items-center rounded-lg border border-border bg-muted p-0.5">
              <button
                type="button"
                data-testid="editor-undo"
                onClick={undo}
                disabled={history.length === 0}
                className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-background disabled:opacity-30 disabled:hover:text-muted-foreground"
                aria-label="Undo"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="size-3.5" />
              </button>
              <button
                type="button"
                data-testid="editor-redo"
                onClick={redo}
                disabled={future.length === 0}
                className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-background disabled:opacity-30 disabled:hover:text-muted-foreground"
                aria-label="Redo"
                title="Redo (Ctrl+Shift+Z)"
              >
                <Redo2 className="size-3.5" />
              </button>
            </div>

            {/* Test Run Button */}
            {automationId && (
              <button
                type="button"
                data-testid="editor-run-button"
                onClick={() => void testRun()}
                disabled={running || saving || loading}
                title="Test run this automation workflow"
                className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-xs transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {running ? (
                  <LoaderCircle className="size-3.5 animate-spin text-primary" />
                ) : (
                  <Play className="size-3.5 text-primary fill-primary" />
                )}
                <span>{running ? "Testing…" : "Test run"}</span>
              </button>
            )}

            {/* Save Button */}
            <button
              data-testid="editor-save-button"
              onClick={() => void save()}
              disabled={saving || loading || !dirty}
              className="inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground shadow-xs transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              <span>{saving ? "Saving…" : previewMode && !automationId ? "Save draft" : "Save"}</span>
            </button>
          </div>
        </header>

        {/* Canvas Body */}
        <div data-testid="canvas-viewport" className="relative flex-1 overflow-hidden">
          {/* Floating Add Block FAB on Narrow/Mobile Screens */}
          <div className="absolute top-3.5 left-3.5 z-20 lg:hidden">
            <button
              type="button"
              data-testid="mobile-add-block-fab"
              onClick={() => {
                setPaletteCollapsed(false);
                setSidebarOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card/95 px-3.5 py-2 text-xs font-semibold text-foreground shadow-lg backdrop-blur transition-all hover:bg-accent active:scale-95"
              aria-label="Add block"
            >
              <div className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Plus className="size-3.5 stroke-2" />
              </div>
              <span>Add block</span>
            </button>
          </div>

          {loading ? (
            <div className="grid h-full place-items-center bg-background">
              <LoaderCircle className="size-6 animate-spin text-primary" />
            </div>
          ) : (
            <EdgeActionsContext.Provider value={{ deleteEdge }}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onDragOver={onDragOver}
                onDrop={onDrop}
                isValidConnection={validConnection}
                nodeClickDistance={8}
                nodeDragThreshold={4}
                paneClickDistance={8}
                connectionRadius={36}
                autoPanOnConnect={true}
                autoPanOnNodeDrag={true}
                snapToGrid={true}
                snapGrid={[16, 16]}
                preventScrolling={true}
                panOnScroll={true}
                panOnScrollMode="free"
                panOnDrag={true}
                zoomOnPinch={true}
                zoomOnScroll={false}
                zoomOnDoubleClick={false}
                connectionLineStyle={{
                  strokeWidth: 2.5,
                  stroke: "var(--primary)",
                }}
                onNodeClick={(_, node) => {
                  setSelectedId(node.id);
                  setNodes((current) =>
                    current.map((n) => ({ ...n, selected: n.id === node.id }))
                  );
                  setEdges((current) =>
                    current.map((item) => (item.selected ? { ...item, selected: false } : item))
                  );
                  focusNode(node);
                }}
                onPaneClick={() => {
                  setSelectedId(null);
                  setNodes((current) =>
                    current.map((n) => (n.selected ? { ...n, selected: false } : n))
                  );
                  setEdges((current) =>
                    current.map((e) => (e.selected ? { ...e, selected: false } : e))
                  );
                }}
                onNodeDragStart={() => {
                  commitHistory();
                }}
                onEdgeClick={(_, edge) => {
                  setSelectedId(null);
                  setNodes((current) =>
                    current.map((n) => (n.selected ? { ...n, selected: false } : n))
                  );
                  setEdges((current) =>
                    current.map((item) => ({ ...item, selected: item.id === edge.id }))
                  );
                }}
                fitView
                minZoom={0.2}
                maxZoom={1.6}
                nodesDraggable
                nodesConnectable
                elementsSelectable
                deleteKeyCode={null}
                connectionLineType={ConnectionLineType.Bezier}
                proOptions={{ hideAttribution: true }}
                className="bg-muted/40 touch-none"
                defaultEdgeOptions={{
                  type: "workflow",
                }}
              >
                <Background
                  variant={BackgroundVariant.Dots}
                  gap={16}
                  size={1.2}
                  className="[&_circle]:fill-muted-foreground/30"
                />
                <Controls
                  showInteractive={false}
                  position="bottom-left"
                  className="!border-border !bg-card/95 !shadow-xl !backdrop-blur rounded-lg overflow-hidden [&>button]:!size-8.5 sm:[&>button]:!size-8 [&>button]:!border-border [&>button]:!bg-card [&>button]:!fill-foreground [&>button:hover]:!bg-accent [&>button:active]:!scale-95"
                />
              </ReactFlow>
            </EdgeActionsContext.Provider>
          )}
          {!loading && nodes.length === 0 && !composeOpen && (
            <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center p-6">
              <div className="pointer-events-auto max-w-xs text-center">
                <h2 className="text-sm font-semibold text-foreground">Start your workflow</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Add blocks or describe what you want to automate.</p>
                <button
                  type="button"
                  onClick={() => setComposeOpen(true)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-sm border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <Sparkles className="size-3.5" /> Describe instead
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Inspector Panel */}
      {selected && (
        <Inspector
          node={selected}
          variables={variables}
          devices={devices}
          integrations={integrations}
          update={updateConfig}
          remove={deleteSelection}
          close={() => {
            setSelectedId(null);
            setNodes((current) =>
              current.map((n) => (n.selected ? { ...n, selected: false } : n))
            );
          }}
        />
      )}

      {/* Toast Notice */}
      {notice && (
        <div
          role="status"
          data-testid="editor-toast-notice"
          className={`fixed bottom-5 right-5 z-50 flex max-w-sm items-center gap-2.5 rounded-xl px-4 py-3 text-xs font-medium shadow-2xl transition-all ${
            notice.kind === "error"
              ? "bg-destructive/10 text-destructive border border-destructive/20"
              : notice.kind === "info"
              ? "bg-popover text-popover-foreground border border-border"
              : "bg-primary/10 text-primary border border-primary/20"
          }`}
        >
          {notice.kind === "error" ? (
            <CircleAlert className="size-4 shrink-0 text-destructive" />
          ) : (
            <Check className="size-4 shrink-0 text-primary" />
          )}
          <span>{notice.message}</span>
        </div>
      )}

      {/* Discard Changes Alert Dialog */}
      <AlertDialog open={confirmReplaceOpen} onOpenChange={setConfirmReplaceOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace the current graph?</AlertDialogTitle>
            <AlertDialogDescription>
              {replacement === "example" ? "The example" : "The generated draft"} will replace the blocks on this canvas. You can use Undo to restore them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep current graph</AlertDialogCancel>
            <AlertDialogAction onClick={() => replacement === "example" ? previewExample() : void createGeneratedDraft()}>
              {replacement === "example" ? "Replace with example" : "Generate and replace"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Discard Changes Alert Dialog */}
      <AlertDialog
        open={confirmDiscardOpen}
        onOpenChange={setConfirmDiscardOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes in this automation flow. Leaving this page will discard any changes made since the last save.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => navigate(`/p/${proj}/automations`)}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function AutomationEditor() {
  return (
    <ReactFlowProvider>
      <AutomationEditorContent />
    </ReactFlowProvider>
  );
}

function EditorError({
  message,
  retry,
  back,
}: {
  message: string;
  retry: () => void;
  back: () => void;
}) {
  return (
    <main className="grid h-full place-items-center bg-background p-6 text-foreground">
      <div className="max-w-sm text-center">
        <CircleAlert className="mx-auto size-8 text-destructive" />
        <h1 className="mt-4 text-base font-semibold">Editor unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={back}
          >
            Back
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={retry}
          >
            Try again
          </Button>
        </div>
      </div>
    </main>
  );
}
