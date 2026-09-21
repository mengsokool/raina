import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams, useLoaderData } from "react-router";
import {
  ArrowRight,
  Blocks,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Ellipsis,
  LoaderCircle,
  Plus,
  Play,
  RotateCw,
  Sparkles,
  Trash2,
  Zap,
  Pencil,
} from "lucide-react";
import { Automation, Integration, blocks, integrations } from "@raina/workflow";
import {
  createAutomation,
  deleteAutomation,
  listAutomations,
  runAutomation,
  updateAutomation,
  deleteIntegration,
  listIntegrations,
  testIntegration,
  updateIntegration,
} from "@/lib/api-client";
import { getServerAutomations, getServerIntegrations } from "@/lib/server-loaders";
import { Button } from "@/components/ui/button";
import { AutomationSnippetDiagram } from "./canvas/AutomationSnippetDiagram";
import { IntegrationModal } from "@/components/integrations/IntegrationModal";
import { IntegrationFieldInput } from "@/components/integrations/IntegrationFieldInput";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Config = Record<string, unknown>;
type EditorMode = "create" | "edit" | null;

const PROVIDER_METADATA: Record<
  string,
  {
    badgeClass: string;
    iconColor: string;
    borderHover: string;
    tag: string;
  }
> = {
  http_service: {
    badgeClass: "bg-info/10 text-info border-info/20",
    iconColor: "text-info",
    borderHover: "hover:border-info/40 hover:shadow-info/5",
    tag: "Webhook",
  },
  email: {
    badgeClass: "bg-chart-3/10 text-chart-3 border-chart-3/20",
    iconColor: "text-chart-3",
    borderHover: "hover:border-chart-3/40 hover:shadow-chart-3/5",
    tag: "Email",
  },
  telegram: {
    badgeClass: "bg-info/10 text-info border-info/20",
    iconColor: "text-info",
    borderHover: "hover:border-info/40 hover:shadow-info/5",
    tag: "Chat Bot",
  },
  slack: {
    badgeClass: "bg-primary/10 text-primary border-primary/20",
    iconColor: "text-primary",
    borderHover: "hover:border-primary/40 hover:shadow-primary/5",
    tag: "Chat Ops",
  },
  discord: {
    badgeClass: "bg-chart-4/10 text-chart-4 border-chart-4/20",
    iconColor: "text-chart-4",
    borderHover: "hover:border-chart-4/40 hover:shadow-chart-4/5",
    tag: "Community",
  },
  twilio: {
    badgeClass: "bg-destructive/10 text-destructive border-destructive/20",
    iconColor: "text-destructive",
    borderHover: "hover:border-destructive/40 hover:shadow-destructive/5",
    tag: "SMS & WhatsApp",
  },
  ms_teams: {
    badgeClass: "bg-chart-4/10 text-chart-4 border-chart-4/20",
    iconColor: "text-chart-4",
    borderHover: "hover:border-chart-4/40 hover:shadow-chart-4/5",
    tag: "Enterprise",
  },
  pagerduty: {
    badgeClass: "bg-chart-2/10 text-chart-2 border-chart-2/20",
    iconColor: "text-chart-2",
    borderHover: "hover:border-chart-2/40 hover:shadow-chart-2/5",
    tag: "Incidents",
  },
};

const recipes = [
  {
    id: "threshold",
    name: "Temperature alert",
    description: "Notify a channel when a reading crosses a threshold.",
    trigger: "variable",
    action: "call_integration",
    triggerConfig: {
      variable: "temperature",
      operator: ">",
      value: "30",
      mode: "edge",
    },
    actionConfig: {},
  },
  {
    id: "schedule",
    name: "Daily device check",
    description: "Run a routine automatically at the same time every day.",
    trigger: "schedule",
    action: "emit_event",
    triggerConfig: { time: "08:00" },
    actionConfig: { event: "daily_check" },
  },
  {
    id: "relay",
    name: "Telemetry relay",
    description: "Forward an incoming device event to an external endpoint.",
    trigger: "event",
    action: "call_integration",
    triggerConfig: { event: "telemetry_received" },
    actionConfig: {},
  },
] as const;

const triggerKind = (kind?: string) =>
  kind === "variable_changed" || kind === "variable"
    ? "variable"
    : blocks.TRIGGER_CATALOG.some((item) => item.kind === kind)
      ? kind!
      : "manual";
const relativeTime = (timestamp: number | null) => {
  if (!timestamp) return "Never run";
  const seconds = Math.max(
    0,
    Math.floor(
      (Date.now() - (timestamp > 1e11 ? timestamp : timestamp * 1000)) / 1000,
    ),
  );
  return seconds < 60
    ? "Just now"
    : seconds < 3600
      ? `${Math.floor(seconds / 60)}m ago`
      : seconds < 86400
        ? `${Math.floor(seconds / 3600)}h ago`
        : `${Math.floor(seconds / 86400)}d ago`;
};

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-foreground">
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
      )}
    </label>
  );
}

function Placeholder({ onRetry }: { onRetry?: () => void }) {
  return onRetry ? (
    <div className="rounded-sm border border-destructive/20 bg-destructive/10 p-7 text-center">
      <CircleAlert className="mx-auto size-5 text-destructive" />
      <h2 className="mt-2 text-sm font-semibold text-destructive">
        Automations could not be loaded
      </h2>
      <p className="mt-1 text-xs text-destructive/80">
        Check the API connection and try again.
      </p>
      <Button size="sm" variant="outline" className="mt-4" onClick={onRetry}>
        <RotateCw />
        Try again
      </Button>
    </div>
  ) : (
    <div className="space-y-3">
      <div className="h-28 animate-pulse rounded-sm bg-muted" />
      <div className="h-28 animate-pulse rounded-sm bg-muted" />
      <div className="h-28 animate-pulse rounded-sm bg-muted" />
    </div>
  );
}

interface AutomationsHubViewProps {
  proj: string;
  initialAutomations: Automation[];
  initialIntegrations: Integration[];
}

export function AutomationsHubView({
  proj,
  initialAutomations,
  initialIntegrations,
}: AutomationsHubViewProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isIntegrations = searchParams.get("tab") === "integrations";
  const [automations, setAutomations] = useState<Automation[]>(initialAutomations);
  const [integrationRows, setIntegrationRows] = useState<Integration[]>(initialIntegrations);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [mode, setMode] = useState<EditorMode>(null);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState("variable");
  const [action, setAction] = useState("set_variable");
  const [triggerConfig, setTriggerConfig] = useState<Config>({
    variable: "",
    operator: "changed",
    mode: "edge",
  });
  const [actionConfig, setActionConfig] = useState<Config>({
    variable: "",
    value: "",
  });
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [modalKind, setModalKind] = useState<integrations.IntegrationKind>("http_service");
  const [editingIntegration, setEditingIntegration] = useState<Integration | null>(null);
  const [integrationModalOpen, setIntegrationModalOpen] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; message: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [deletingAutomation, setDeletingAutomation] = useState<Automation | null>(null);
  const [deletingIntegration, setDeletingIntegration] = useState<Integration | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const usedByCountMap = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of automations) {
      const nodes = a.graph?.nodes || [];
      const seen = new Set<string>();
      for (const n of nodes) {
        if (n.kind === "call_integration") {
          const id = String(n.config?.integration_id || n.config?.integration || "");
          if (id && !seen.has(id)) {
            seen.add(id);
            counts[id] = (counts[id] || 0) + 1;
          }
        }
      }
      for (const act of ((a.actions as any[]) || [])) {
        if (act.type === "call_integration" && act.integration_id && !seen.has(act.integration_id)) {
          seen.add(act.integration_id);
          counts[act.integration_id] = (counts[act.integration_id] || 0) + 1;
        }
      }
    }
    return counts;
  }, [automations]);

  const byIntegrationId = useMemo(
    () => new Map(integrationRows.map((item) => [item.id, item])),
    [integrationRows],
  );
  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const [automationData, integrationData] = await Promise.all([
        listAutomations(proj),
        listIntegrations(proj),
      ]);
      setAutomations(automationData as any);
      setIntegrationRows(integrationData as any);
    } catch (caught) {
      console.error(caught);
      setError(true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [proj]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const _resetEditor = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setTrigger("variable");
    setAction("set_variable");
    setTriggerConfig({ variable: "", operator: "changed", mode: "edge" });
    setActionConfig({ variable: "", value: "" });
  };
  const openCreate = (recipe?: (typeof recipes)[number]) =>
    navigate(
      `/p/${proj}/automations/editor${recipe ? `?recipe=${recipe.id === "threshold" ? "freezer-guard" : recipe.id === "schedule" ? "morning-startup" : "dusk-to-dawn"}` : ""}`,
    );
  const graphFor = (automation: Automation) =>
    automation.graph?.nodes?.length
      ? automation.graph
      : blocks.buildLinearGraph(
          triggerKind(automation.trigger_type),
          (automation.trigger_config as Config) ?? {},
          automation.actions,
        );
  const _openEdit = (automation: Automation) =>
    navigate(`/p/${proj}/automations/editor?id=${automation.id}`);
  const updateTrigger = (key: string, value: unknown) =>
    setTriggerConfig((current) => ({ ...current, [key]: value }));
  const updateAction = (key: string, value: unknown) =>
    setActionConfig((current) => ({ ...current, [key]: value }));
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const graph = {
      nodes: [
        { id: "trigger", kind: trigger, config: triggerConfig },
        { id: "action", kind: action, config: actionConfig },
      ],
      edges: [{ from: "trigger", to: "action", port: "out" }],
    };
    const body = {
      name: name.trim(),
      description: description.trim() || null,
      trigger_type: trigger,
      trigger_config: triggerConfig,
      actions: [{ type: action, ...actionConfig }],
      graph,
    };
    try {
      if (editing) {
        await updateAutomation(proj, editing.id, body);
      } else {
        await createAutomation(proj, body);
      }
      setMode(null);
      setToast(editing ? "Automation updated" : "Automation created");
      await load();
    } catch (caught) {
      console.error(caught);
      setToast("Could not save automation. Try again.");
    } finally {
      setSaving(false);
    }
  };
  const toggle = async (automation: Automation) => {
    setAutomations((current) =>
      current.map((item) =>
        item.id === automation.id ? { ...item, enabled: !item.enabled } : item,
      ),
    );
    try {
      await updateAutomation(proj, automation.id, { enabled: !automation.enabled });
    } catch (caught) {
      console.error(caught);
      setAutomations((current) =>
        current.map((item) =>
          item.id === automation.id
            ? { ...item, enabled: automation.enabled }
            : item,
        ),
      );
      setToast("Could not update status. Try again.");
    }
  };
  const run = async (id: string) => {
    setMenu(null);
    setRunning(id);
    try {
      await runAutomation(proj, id);
      setToast("Automation ran successfully");
      await load();
    } catch (caught) {
      console.error(caught);
      setToast("Could not run automation. Try again.");
    } finally {
      setRunning(null);
    }
  };
  const requestDeleteAutomation = (automation: Automation) => {
    setMenu(null);
    setDeletingAutomation(automation);
  };

  const handleDeleteAutomation = async () => {
    if (!deletingAutomation) return;
    setIsDeleting(true);
    try {
      await deleteAutomation(proj, deletingAutomation.id);
      setAutomations((current) =>
        current.filter((item) => item.id !== deletingAutomation.id),
      );
      setToast("Automation deleted");
      setDeletingAutomation(null);
    } catch (caught) {
      console.error(caught);
      setToast("Could not delete automation. Try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const openCreateIntegration = (kind: integrations.IntegrationKind) => {
    setEditingIntegration(null);
    setModalKind(kind);
    setIntegrationModalOpen(true);
  };

  const openEditIntegration = (item: Integration) => {
    setEditingIntegration(item);
    setModalKind(item.kind as integrations.IntegrationKind);
    setIntegrationModalOpen(true);
  };

  const requestDeleteIntegration = (item: Integration) => {
    setDeletingIntegration(item);
  };

  const handleDeleteIntegration = async () => {
    if (!deletingIntegration) return;
    setIsDeleting(true);
    try {
      await deleteIntegration(proj, deletingIntegration.id);
      setIntegrationRows((current) =>
        current.filter((entry) => entry.id !== deletingIntegration.id),
      );
      setToast("Integration removed");
      setDeletingIntegration(null);
    } catch (caught) {
      console.error(caught);
      setToast("Could not remove integration. Try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggle = async (item: Integration) => {
    try {
      await updateIntegration(proj, item.id, { enabled: !item.enabled });
      setIntegrationRows((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, enabled: !item.enabled } : i))
      );
      setToast(item.enabled ? "Integration disabled" : "Integration enabled");
    } catch (err) {
      console.error(err);
      setToast("Could not update status. Try again.");
    }
  };

  const handleTest = async (item: Integration) => {
    setTestingId(item.id);
    setTestResult(null);
    try {
      const data = await testIntegration(proj, item.id, { message: "Test notification from Raina IoT" });
      const isOk = data.status === "ok";
      setTestResult({
        id: item.id,
        ok: isOk,
        message: isOk
          ? `Delivered${data.detail ? ` (${data.detail})` : ""}`
          : `${data.status}: ${data.detail || "Error"}`,
      });
      setTimeout(() => setTestResult(null), 6000);
      void load();
    } catch (err: any) {
      setTestResult({ id: item.id, ok: false, message: err.message || "Failed to test" });
      setTimeout(() => setTestResult(null), 6000);
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-3 py-4 sm:px-6 sm:py-8 space-y-6">
      {/* 1. Page Header: Title on Left, Action Button on Right */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Automations & Integrations
          </h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Wire device signals into reliable actions, alerts, and third-party integrations.
          </p>
        </div>

        {!isIntegrations ? (
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <Button
              size="sm"
              variant="outline"
              asChild
            >
              <Link to={`/p/${proj}/automations/editor?compose=1`}>
                <Sparkles className="size-3.5" />
                <span>Describe a workflow</span>
              </Link>
            </Button>
            <Button
              size="sm"
              asChild
            >
              <Link to={`/p/${proj}/automations/editor`}>
                <Plus className="size-3.5" />
                <span>New automation</span>
              </Link>
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            onClick={() => setPickerOpen(true)}
            className="self-start sm:self-auto"
          >
            <Plus className="size-3.5" />
            <span>New integration</span>
          </Button>
        )}
      </header>

      {/* 2. Navigation Sub-bar: Tabs on Left, Meta/Count on Right */}
      <nav
        aria-label="Section Tabs"
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-3"
      >
        <div
          role="tablist"
          className="inline-flex items-center rounded-xl bg-muted p-1 border border-border shadow-xs"
        >
          <Link
            to={`/p/${proj}/automations`}
            replace
            role="tab"
            aria-selected={!isIntegrations}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all ${
              !isIntegrations
                ? "bg-card text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Zap className="size-3.5" />
            <span>Automations</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-xs font-semibold transition-colors ${
                !isIntegrations
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {automations.length}
            </span>
          </Link>
          <Link
            to={`/p/${proj}/automations?tab=integrations`}
            replace
            role="tab"
            aria-selected={isIntegrations}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all ${
              isIntegrations
                ? "bg-card text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Blocks className="size-3.5" />
            <span>Integrations</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-xs font-semibold transition-colors ${
                isIntegrations
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {integrationRows.length}
            </span>
          </Link>
        </div>

        <div className="text-xs text-muted-foreground">
          {!isIntegrations ? (
            automations.length > 0 ? (
              <span>{automations.length} rule{automations.length === 1 ? "" : "s"} · Runs left to right</span>
            ) : null
          ) : (
            <span>{integrationRows.length} configured · {integrations.CATALOG.filter((s) => s.executable).length} available</span>
          )}
        </div>
      </nav>

      {!isIntegrations && (
        <section className="space-y-4">
          {loading ? (
            <Placeholder />
          ) : error ? (
            <Placeholder onRetry={load} />
          ) : automations.length === 0 ? (
            <Empty onCreate={() => openCreate()} onRecipe={openCreate} proj={proj} />
          ) : (
            <div className="space-y-3">
              {automations.map((automation) => {
                const graph = graphFor(automation);
                const editUrl = `/p/${proj}/automations/editor?id=${automation.id}`;
                return (
                  <article
                    key={automation.id}
                    className={`rounded-xl border bg-card p-4 transition-all shadow-xs ${
                      automation.enabled
                        ? "border-border hover:border-primary/50 hover:shadow-md"
                        : "border-border opacity-75"
                    }`}
                  >
                    <div className="flex items-start gap-3.5">
                      <Link
                        to={editUrl}
                        className={`grid size-10 shrink-0 place-items-center rounded-lg transition-transform hover:scale-105 active:scale-95 ${
                          automation.enabled
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                        title="Open workflow editor"
                      >
                        <Zap className="size-5" />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <Link
                            to={editUrl}
                            className="truncate text-sm font-semibold text-foreground hover:text-primary transition-colors cursor-pointer"
                          >
                            {automation.name}
                          </Link>
                          <span
                            className={`inline-flex items-center gap-1 text-xs ${
                              automation.enabled ? "text-primary" : "text-muted-foreground"
                            }`}
                          >
                            <span
                              className={`size-1.5 rounded-full ${
                                automation.enabled ? "bg-primary" : "bg-muted-foreground/30"
                              }`}
                            />
                            {automation.enabled ? "Enabled" : "Paused"}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {automation.description || "No description added."}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          asChild
                          className="hidden sm:inline-flex"
                        >
                          <Link to={editUrl}>
                            <Pencil className="size-3.5" />
                            <span>Edit</span>
                          </Link>
                        </Button>
                        <Switch
                          checked={automation.enabled}
                          onCheckedChange={() => void toggle(automation)}
                          aria-label={`${automation.enabled ? "Disable" : "Enable"} ${automation.name}`}
                        />
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() =>
                              setMenu(
                                menu === automation.id ? null : automation.id,
                              )
                            }
                            aria-label={`Actions for ${automation.name}`}
                            aria-expanded={menu === automation.id}
                            className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          >
                            <Ellipsis className="size-4" />
                          </button>
                          {menu === automation.id && (
                            <div className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-lg border border-border bg-popover p-1 text-xs text-popover-foreground shadow-lg">
                              <button
                                type="button"
                                onClick={() => void run(automation.id)}
                                className="menu-item"
                              >
                                <Play className="size-3.5" />
                                Run now
                              </button>
                              <Link
                                to={editUrl}
                                onClick={() => setMenu(null)}
                                className="menu-item"
                              >
                                <Pencil className="size-3.5" />
                                Edit rule
                              </Link>
                              <button
                                type="button"
                                onClick={() => requestDeleteAutomation(automation)}
                                className="menu-item text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="size-3.5" />
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3.5">
                      <Link
                        to={editUrl}
                        className="block cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
                        title="Click to open visual workflow editor"
                      >
                        <AutomationSnippetDiagram
                          graph={graph as any}
                          byIntegrationId={byIntegrationId as any}
                        />
                      </Link>
                    </div>
                    <footer className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs">
                      <span
                        className={`inline-flex items-center gap-1 ${automation.last_run_status === "error" ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        {automation.last_run_status === "error" ? (
                          <CircleAlert className="size-3.5" />
                        ) : (
                          <Check className="size-3.5" />
                        )}
                        {automation.last_run_status === "ok"
                          ? "Last run succeeded"
                          : automation.last_run_status === "error"
                            ? "Last run failed"
                            : "Waiting to run"}
                      </span>
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        {running === automation.id ? (
                          <LoaderCircle className="size-3.5 animate-spin" />
                        ) : (
                          <Clock3 className="size-3.5" />
                        )}
                        {running === automation.id
                          ? "Running…"
                          : relativeTime(automation.last_run_at)}
                      </span>
                    </footer>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
      {isIntegrations && (
        <section className="space-y-4">
          {loading ? (
            <Placeholder />
          ) : error ? (
            <Placeholder onRetry={load} />
          ) : integrationRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
              <div className="mx-auto grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground">
                <Blocks className="size-5" />
              </div>
              <h2 className="mt-3 text-sm font-semibold text-foreground">
                No integrations configured
              </h2>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                Connect webhooks, email, chat bots, SMS, or incident tools to trigger external notifications from your automations.
              </p>
              <Button
                size="sm"
                onClick={() => setPickerOpen(true)}
                className="mt-4"
              >
                <Plus className="size-3.5" />
                <span>Add integration</span>
              </Button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {integrationRows.map((item) => {
                const spec = integrations.connSpec(item.kind as any);
                const subtitle = integrations.summarize(spec, (item.config as any) || {});
                const usedCount = usedByCountMap[item.id] || 0;
                const isTesting = testingId === item.id;
                const testInfo = testResult && testResult.id === item.id ? testResult : null;
                const meta = PROVIDER_METADATA[item.kind] || {
                  badgeClass: "bg-muted text-muted-foreground border-border",
                  iconColor: "text-muted-foreground",
                  borderHover: "hover:border-foreground/40",
                  tag: "Service",
                };

                return (
                  <div
                    key={item.id}
                    className={`rounded-lg border border-border/80 bg-card p-3 transition-all ${
                      item.enabled !== false
                        ? "hover:border-foreground/40 shadow-xs"
                        : "opacity-60 bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`grid size-9 shrink-0 place-items-center rounded-lg border ${meta.badgeClass}`}
                      >
                        <svg
                          className="size-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d={spec.icon} />
                        </svg>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="truncate text-xs font-semibold text-foreground">
                            {item.name}
                          </h4>
                          <span className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            {spec.label}
                          </span>
                          {usedCount > 0 ? (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                              Used in {usedCount} rule{usedCount === 1 ? "" : "s"}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Unused
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                          {subtitle && (
                            <span className="truncate font-mono text-muted-foreground max-w-xs sm:max-w-md" title={subtitle}>
                              {subtitle}
                            </span>
                          )}

                          {item.last_run_status === "ok" ? (
                            <span className="inline-flex items-center gap-1 font-medium text-primary">
                              <span className="size-1.5 rounded-full bg-primary" />
                              OK {item.last_run_at ? `(${relativeTime(item.last_run_at)})` : ""}
                            </span>
                          ) : item.last_run_status === "error" ? (
                            <span className="inline-flex items-center gap-1 font-medium text-destructive" title={item.last_error || undefined}>
                              <span className="size-1.5 rounded-full bg-destructive" />
                              Failed {item.last_run_at ? `(${relativeTime(item.last_run_at)})` : ""}
                            </span>
                          ) : null}

                          {testInfo && (
                            <span className={testInfo.ok ? "font-medium text-primary" : "font-medium text-destructive"}>
                              • {testInfo.message}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions toolbar */}
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isTesting}
                          onClick={() => void handleTest(item)}
                        >
                          {isTesting ? (
                            <LoaderCircle className="size-3 animate-spin" />
                          ) : (
                            <Play className="size-3" />
                          )}
                          <span>Test</span>
                        </Button>

                        <Switch
                          checked={item.enabled !== false}
                          onCheckedChange={() => void handleToggle(item)}
                          aria-label={item.enabled !== false ? "Disable integration" : "Enable integration"}
                        />

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEditIntegration(item)}
                          aria-label={`Edit ${item.name}`}
                        >
                          <Pencil className="size-3.5" />
                        </Button>

                        <Button
                          type="button"
                          variant="destructive-ghost"
                          size="icon-sm"
                          onClick={() => requestDeleteIntegration(item)}
                          aria-label={`Delete ${item.name}`}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Choose Integration Dialog */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add Integration</DialogTitle>
            <DialogDescription>
              Choose a service destination to connect to your project.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2.5 sm:grid-cols-2 pt-2">
            {integrations.CATALOG.filter((spec) => spec.executable).map((spec) => {
              const meta = PROVIDER_METADATA[spec.kind] || {
                badgeClass: "bg-muted text-muted-foreground border-border",
                iconColor: "text-muted-foreground",
                tag: "Service",
              };
              return (
                <button
                  key={spec.kind}
                  type="button"
                  onClick={() => {
                    setPickerOpen(false);
                    openCreateIntegration(spec.kind);
                  }}
                  className="group flex items-start gap-3 rounded-lg border border-border/80 bg-card p-3 text-left transition-all hover:border-primary/50 hover:bg-accent"
                >
                  <div
                    className={`grid size-8 shrink-0 place-items-center rounded-md border ${meta.badgeClass}`}
                  >
                    <svg
                      className="size-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d={spec.icon} />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="truncate text-xs font-semibold text-foreground group-hover:text-primary">
                        {spec.label}
                      </h4>
                      <span className="text-xs text-muted-foreground">
                        {meta.tag}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {spec.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={mode !== null}
        onOpenChange={(open) => !open && setMode(null)}
      >
        <DialogContent className="max-h-dvh max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {mode === "edit" ? "Edit automation" : "New automation"}
            </DialogTitle>
            <DialogDescription>
              Choose the trigger and action for this flow.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                <input
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Alert when water is low"
                  className="field"
                />
              </Field>
              <Field label="Description">
                <input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Optional note"
                  className="field"
                />
              </Field>
            </div>
            <EditorStep number="1" title="When this happens">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Trigger">
                  <Select
                    value={trigger}
                    onValueChange={(val) => {
                      setTrigger(val);
                      setTriggerConfig({});
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {blocks.TRIGGER_CATALOG.map((item) => (
                        <SelectItem key={item.kind} value={item.kind}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <TriggerFields
                  kind={trigger}
                  config={triggerConfig}
                  change={updateTrigger}
                />
              </div>
            </EditorStep>
            <div className="flex justify-center">
              <ArrowRight className="size-5 text-muted-foreground" />
            </div>
            <EditorStep number="2" title="Then do this">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Action">
                  <Select
                    value={action}
                    onValueChange={(val) => {
                      setAction(val);
                      setActionConfig({});
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {blocks.ACTION_CATALOG.map((item) => (
                        <SelectItem key={item.kind} value={item.kind}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <ActionFields
                  kind={action}
                  config={actionConfig}
                  rows={integrationRows}
                  change={updateAction}
                />
              </div>
            </EditorStep>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setMode(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving || !name.trim()}
              >
                {saving && <LoaderCircle className="animate-spin" />}
                {saving
                  ? "Saving…"
                  : mode === "edit"
                    ? "Save changes"
                    : "Create automation"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {/* Delete Automation Alert Dialog */}
      <AlertDialog
        open={!!deletingAutomation}
        onOpenChange={(open) => !open && setDeletingAutomation(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete automation &ldquo;{deletingAutomation?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Any active triggers and downstream actions configured for this automation will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteAutomation();
              }}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Integration Alert Dialog */}
      <AlertDialog
        open={!!deletingIntegration}
        onOpenChange={(open) => !open && setDeletingIntegration(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete integration &ldquo;{deletingIntegration?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deletingIntegration && (usedByCountMap[deletingIntegration.id] || 0) > 0 ? (
                <span className="text-warning font-medium">
                  Warning: This integration is currently used by {(usedByCountMap[deletingIntegration.id] || 0)} automation(s). Those automations will fail until reconfigured.
                </span>
              ) : (
                "This action cannot be undone. Automations will no longer be able to deliver alerts or payloads to this destination."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteIntegration();
              }}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <IntegrationModal
        open={integrationModalOpen}
        onOpenChange={setIntegrationModalOpen}
        kind={modalKind}
        integration={editingIntegration}
        projectId={proj}
        onSuccess={() => {
          setToast(editingIntegration ? "Integration updated" : "Integration added");
          void load();
        }}
      />
      {toast && (
        <div
          role="status"
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg bg-foreground px-4 py-3 text-xs font-medium text-background shadow-lg"
        >
          <Check className="size-4 text-primary" />
          {toast}
        </div>
      )}
    </div>
  );
}

function EditorStep({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-sm border border-border p-4">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="grid size-6 place-items-center rounded-md bg-primary/10 text-xs text-primary">
          {number}
        </span>
        {title}
      </div>
      {children}
    </div>
  );
}
function TriggerFields({
  kind,
  config,
  change,
}: {
  kind: string;
  config: Config;
  change: (key: string, value: unknown) => void;
}) {
  if (kind === "manual")
    return (
      <p className="self-end pb-2 text-xs text-muted-foreground">
        Runs only when you select Run now.
      </p>
    );
  if (kind === "schedule")
    return (
      <Field label="Time">
        <input
          type="time"
          value={String(config.time ?? "08:00")}
          onChange={(event) => change("time", event.target.value)}
          className="field"
        />
      </Field>
    );
  if (kind === "event")
    return (
      <Field label="Event name">
        <input
          value={String(config.event ?? "")}
          onChange={(event) => change("event", event.target.value)}
          placeholder="e.g. door_opened"
          className="field font-mono"
        />
      </Field>
    );
  if (kind === "sunset_sunrise")
    return (
      <Field label="Solar event">
        <Select
          value={String(config.event ?? "sunset")}
          onValueChange={(val) => change("event", val)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sunrise">Sunrise</SelectItem>
            <SelectItem value="sunset">Sunset</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    );
  return (
    <div className="grid gap-3">
      <Field label="Variable">
        <input
          value={String(config.variable ?? "")}
          onChange={(event) => change("variable", event.target.value)}
          placeholder="e.g. temperature"
          className="field font-mono"
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Condition">
          <Select
            value={String(config.operator ?? "changed")}
            onValueChange={(val) => change("operator", val)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="changed">Changes</SelectItem>
              <SelectItem value=">">Greater than</SelectItem>
              <SelectItem value="<">Less than</SelectItem>
              <SelectItem value=">=">At least</SelectItem>
              <SelectItem value="<=">At most</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {config.operator !== "changed" && (
          <Field label="Value">
            <input
              value={String(config.value ?? "")}
              onChange={(event) => change("value", event.target.value)}
              className="field"
            />
          </Field>
        )}
      </div>
    </div>
  );
}
function ActionFields({
  kind,
  config,
  rows,
  change,
}: {
  kind: string;
  config: Config;
  rows: Integration[];
  change: (key: string, value: unknown) => void;
}) {
  if (kind === "call_integration") {
    const selectedId = String(config.integration_id ?? "__none__");
    const selectedInt = rows.find((r) => r.id === selectedId);
    const selectedKind = selectedInt ? (selectedInt.kind as integrations.IntegrationKind) : null;
    const operations = selectedKind ? integrations.connOperations(selectedKind) : [];
    const currentOp = (config.operation as string) || (operations[0]?.key ?? "");
    const opFields = selectedKind ? integrations.operationFields(selectedKind, currentOp) : [];
    const params = (config.params as Record<string, unknown>) || {};

    const handleParamChange = (key: string, val: unknown) => {
      const newParams = { ...params, [key]: val };
      change("params", newParams);
    };

    return (
      <div className="space-y-4 sm:col-span-2">
        <Field label="Integration">
          <Select
            value={selectedId}
            onValueChange={(val) => {
              const id = val === "__none__" ? "" : val;
              change("integration_id", id);
              const found = rows.find((r) => r.id === id);
              if (found) {
                const ops = integrations.connOperations(found.kind as any);
                if (ops[0]) {
                  change("operation", ops[0].key);
                  const defaults: Record<string, unknown> = {};
                  for (const f of integrations.operationFields(found.kind as any, ops[0].key)) {
                    if (f.default !== undefined) defaults[f.key] = f.default;
                  }
                  change("params", defaults);
                }
              }
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose an integration" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Choose an integration</SelectItem>
              {rows.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name} ({integrations.connSpec(item.kind as any).label})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {rows.length === 0 && (
            <span className="mt-1 block text-xs text-warning">
              Add an integration from the Integrations tab first.
            </span>
          )}
        </Field>

        {selectedKind && operations.length > 1 && (
          <Field label="Operation">
            <Select
              value={currentOp}
              onValueChange={(val) => {
                change("operation", val);
                const defaults: Record<string, unknown> = { ...params };
                for (const f of integrations.operationFields(selectedKind, val)) {
                  if (defaults[f.key] === undefined && f.default !== undefined) {
                    defaults[f.key] = f.default;
                  }
                }
                change("params", defaults);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {operations.map((op) => (
                  <SelectItem key={op.key} value={op.key}>
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        {selectedKind && opFields.length > 0 && (
          <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Action Parameters
            </div>
            {opFields.map((p) => (
              <Field key={p.key} label={p.label} hint={p.hint}>
                <IntegrationFieldInput
                  field={p}
                  value={params[p.key] !== undefined ? params[p.key] : p.default ?? ""}
                  onChange={(val) => handleParamChange(p.key, val)}
                />
              </Field>
            ))}
          </div>
        )}
      </div>
    );
  }
  if (kind === "emit_event")
    return (
      <Field label="Event name">
        <input
          value={String(config.event ?? "")}
          onChange={(event) => change("event", event.target.value)}
          placeholder="e.g. pump_started"
          className="field font-mono"
        />
      </Field>
    );
  if (kind === "delay")
    return (
      <div className="grid grid-cols-2 gap-2">
        <Field label="Wait">
          <input
            type="number"
            min="1"
            value={String(config.delay_amount ?? 30)}
            onChange={(event) => change("delay_amount", event.target.value)}
            className="field"
          />
        </Field>
        <Field label="Unit">
          <Select
            value={String(config.delay_unit ?? "seconds")}
            onValueChange={(val) => change("delay_unit", val)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="seconds">seconds</SelectItem>
              <SelectItem value="minutes">minutes</SelectItem>
              <SelectItem value="hours">hours</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
    );
  return (
    <div className="grid gap-3">
      <Field label="Variable">
        <input
          value={String(config.variable ?? "")}
          onChange={(event) => change("variable", event.target.value)}
          placeholder="e.g. pump_relay"
          className="field font-mono"
        />
      </Field>
      <Field label="Value">
        <input
          value={String(config.value ?? "")}
          onChange={(event) => change("value", event.target.value)}
          placeholder="e.g. true"
          className="field"
        />
      </Field>
    </div>
  );
}
function Empty({
  onCreate,
  onRecipe,
  proj,
}: {
  onCreate: () => void;
  onRecipe: (recipe: (typeof recipes)[number]) => void;
  proj?: string;
}) {
  return (
    <div>
      <div className="rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center">
        <div className="mx-auto grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
          <Zap className="size-5" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-foreground">
          Make your devices respond
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Start with a trigger, connect an action, and let Raina handle the
          routine work.
        </p>
        <Button
          size="sm"
          asChild
          className="mt-5"
        >
          <Link to={proj ? `/p/${proj}/automations/editor` : "#"} onClick={!proj ? onCreate : undefined}>
            <Plus />
            Build an automation
          </Link>
        </Button>
      </div>
      <div className="mt-7">
        <h3 className="text-sm font-semibold text-foreground">
          Start from a recipe
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {recipes.map((recipe) => (
            <Link
              key={recipe.id}
              to={
                proj
                  ? `/p/${proj}/automations/editor?recipe=${
                      recipe.id === "threshold"
                        ? "freezer-guard"
                        : recipe.id === "schedule"
                        ? "morning-startup"
                        : "dusk-to-dawn"
                    }`
                  : "#"
              }
              onClick={!proj ? () => onRecipe(recipe) : undefined}
              className="group rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
            >
              <Zap className="size-4 text-primary" />
              <p className="mt-4 text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                {recipe.name}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {recipe.description}
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                Use recipe <ChevronRight className="size-3.5" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export function meta() {
  return [
    { title: "Automations & Recipes — raina" },
    { name: "description", content: "Create edge automation rules and third-party alert integrations" },
  ];
}

export async function loader({ params, request }: { params: { proj: string }; request: Request }) {
  const proj = params.proj;
  const [initialAutomations, initialIntegrations] = await Promise.all([
    getServerAutomations(proj, request),
    getServerIntegrations(proj, request),
  ]);

  return { proj, initialAutomations, initialIntegrations };
}

export default function AutomationsHubPage() {
  const { proj, initialAutomations, initialIntegrations } = useLoaderData<typeof loader>();
  return (
    <AutomationsHubView
      proj={proj}
      initialAutomations={initialAutomations as any}
      initialIntegrations={initialIntegrations as any}
    />
  );
}
