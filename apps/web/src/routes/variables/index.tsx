import React, { useState, useEffect, useMemo } from "react";
import { useLoaderData } from "react-router";
import { Plus, Search, X, Pencil, Check, Trash2 } from "lucide-react";
import { Variable } from "@/types";
import { listVariables, createVariable, updateVariable, deleteVariable } from "@/lib/api-client";
import { getServerVariables } from "@/lib/server-loaders";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const UNIT_OPTIONS = [
  "°C", "°F", "K", "%", "µg/m³", "mg/m³", "ppm", "ppb",
  "Pa", "hPa", "kPa", "bar", "psi", "V", "mV", "A", "mA",
  "W", "kW", "Wh", "kWh", "Hz", "rpm", "lux", "dB",
  "m", "cm", "mm", "km", "m/s", "km/h", "L", "mL", "m³",
  "g", "kg", "s", "min", "h",
];

function relativeTime(ts: number | null): string {
  if (!ts) return "Never";
  const ms = ts > 1e11 ? ts : ts * 1000;
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return "just now";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface VariableWithVal extends Variable {
  value?: string | number | boolean | null;
}

interface VariablesViewProps {
  proj: string;
  initialVariables?: VariableWithVal[];
}

export function VariablesView({ proj, initialVariables = [] }: VariablesViewProps) {
  const [variables, setVariables] = useState<VariableWithVal[]>(initialVariables);
  const [searchQuery, setSearchQuery] = useState("");
  const [flashCounts, setFlashCounts] = useState<Record<string, number>>({});

  // Variable create
  const [createVarOpen, setCreateVarOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [newDefaultVal, setNewDefaultVal] = useState("");
  const [creatingVar, setCreatingVar] = useState(false);

  // Inline edit unit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Variable delete confirm modal
  const [deletingVar, setDeletingVar] = useState<VariableWithVal | null>(null);

  const fetchVariables = async () => {
    try {
      const data = await listVariables(proj);
      setVariables(data as any);
    } catch (e) {
      console.error("Failed to load variables", e);
    }
  };

  // Real-time SSE live stream for variables
  useEffect(() => {
    if (!proj) return;

    let eventSource: EventSource | null = null;
    let retryTimeout: any = null;

    const connectStream = () => {
      try {
        eventSource = new EventSource(`/v1/projects/${proj}/variables/stream`);

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (
              data.type === "telemetry" ||
              data.type === "control" ||
              data.type === "update"
            ) {
              const { variable, value, timestamp } = data;
              if (
                variable &&
                !["ts", "timestamp", "time", "date", "_ts"].includes(
                  String(variable).toLowerCase(),
                )
              ) {
                const ts = timestamp
                  ? timestamp > 1e11
                    ? timestamp
                    : timestamp * 1000
                  : Date.now();
                const strVal = value != null ? String(value) : null;

                setFlashCounts((f) => ({
                  ...f,
                  [variable]: (f[variable] || 0) + 1,
                }));

                setVariables((prev) => {
                  const idx = prev.findIndex((v) => v.key === variable);
                  if (idx >= 0) {
                    const next = [...prev];
                    next[idx] = {
                      ...next[idx],
                      value: strVal,
                      last_seen: ts,
                      updated_at: ts,
                    };
                    return next;
                  } else {
                    return [
                      ...prev,
                      {
                        id: `var_${proj}_${variable}`,
                        projectId: proj,
                        deviceId: data.deviceId || "",
                        key: variable,
                        unit: null,
                        value: strVal,
                        created_at: ts,
                        updated_at: ts,
                        last_seen: ts,
                      },
                    ];
                  }
                });
              }
            }
          } catch {}
        };

        eventSource.onerror = () => {
          eventSource?.close();
          retryTimeout = setTimeout(connectStream, 3000);
        };
      } catch {}
    };

    connectStream();

    return () => {
      if (retryTimeout) clearTimeout(retryTimeout);
      eventSource?.close();
    };
  }, [proj]);

  // Periodic ticker so relative time ("just now") updates live
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(timer);
  }, []);

  const handleCreateVariable = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = newKey.trim();
    if (!key) return;

    setCreatingVar(true);
    try {
      await createVariable(proj, {
        key,
        unit: newUnit.trim() || undefined,
        defaultValue: newDefaultVal.trim() || undefined,
      });

      setNewKey("");
      setNewUnit("");
      setNewDefaultVal("");
      setCreateVarOpen(false);
      await fetchVariables();
    } catch (e) {
      console.error("Failed to create variable", e);
    } finally {
      setCreatingVar(false);
    }
  };

  const handleSaveEdit = async (v: VariableWithVal) => {
    const nextUnit = editValue.trim() || null;
    setVariables((prev) =>
      prev.map((item) =>
        item.id === v.id ? { ...item, unit: nextUnit } : item,
      ),
    );
    setEditingId(null);

    try {
      await updateVariable(proj, v.id, { unit: nextUnit });
    } catch (e) {
      console.error(e);
      await fetchVariables();
    }
  };

  const handleDeleteVariable = async () => {
    if (!deletingVar) return;
    try {
      await deleteVariable(proj, deletingVar.id);
      setVariables((prev) =>
        prev.filter((item) => item.id !== deletingVar.id),
      );
      setDeletingVar(null);
    } catch (e) {
      console.error(e);
    }
  };

  const filteredVariables = useMemo(() => {
    if (!searchQuery.trim()) return variables;
    const q = searchQuery.toLowerCase();
    return variables.filter(
      (v) =>
        v.key.toLowerCase().includes(q) ||
        (v.unit && v.unit.toLowerCase().includes(q)),
    );
  }, [variables, searchQuery]);

  return (
    <div className="w-full max-w-5xl mx-auto px-2 py-3 sm:px-5 sm:py-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Variables
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {variables.length} data point{variables.length === 1 ? "" : "s"}
          </p>
        </div>

        <Button
          type="button"
          onClick={() => setCreateVarOpen(true)}
          className="shrink-0"
        >
          <Plus className="size-3.5" />
          <span>New variable</span>
        </Button>
      </header>

      <div className="mb-3.5 relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground z-10" />
        <Input
          type="text"
          variant="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search variables..."
        />
        {searchQuery && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => setSearchQuery("")}
            className="absolute right-1.5 top-1/2 -translate-y-1/2"
          >
            <X className="size-3" />
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-sm border border-border bg-card">
        {filteredVariables.length > 0 ? (
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted uppercase tracking-wider text-muted-foreground font-mono text-xs">
              <tr>
                <th className="px-3 py-2 font-medium">Variable Key</th>
                <th className="px-3 py-2 font-medium">Latest Value</th>
                <th className="px-3 py-2 font-medium">Unit</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">
                  Last Seen
                </th>
                <th className="px-3 py-2 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredVariables.map((v) => {
                const flashCount = flashCounts[v.key] || 0;
                return (
                  <tr
                    key={editingId === v.id ? v.id : `${v.id}-${flashCount}`}
                    className={`hover:bg-accent/50 transition-colors ${
                      flashCount > 0 ? "animate-row-flash" : ""
                    }`}
                  >
                    <td className="px-3 py-2">
                      <span className="font-mono font-medium text-foreground">
                        {v.key}
                      </span>
                    </td>

                    <td className="px-3 py-2">
                      <span className="font-semibold text-foreground font-mono">
                        {v.value != null && v.value !== ""
                          ? String(v.value)
                          : "—"}
                      </span>
                    </td>

                    <td className="px-3 py-2">
                      {editingId === v.id ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="text"
                            size="sm"
                            list="unit-suggestions"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveEdit(v);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            onBlur={() => handleSaveEdit(v)}
                            autoFocus
                            className="w-24"
                          />
                          <Button
                            type="button"
                            variant="success-ghost"
                            size="icon-xs"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSaveEdit(v);
                            }}
                            title="Save unit"
                          >
                            <Check className="size-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 group/edit">
                          <span className="text-muted-foreground font-mono text-xs">
                            {v.unit || "—"}
                          </span>
                          <div className="opacity-60 group-hover/edit:opacity-100">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => {
                                setEditingId(v.id);
                                setEditValue(v.unit || "");
                              }}
                              title="Edit unit"
                            >
                              <Pencil className="size-3" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </td>

                    <td className="hidden px-3 py-2 text-muted-foreground sm:table-cell text-xs font-mono">
                      {v.last_seen ? relativeTime(v.last_seen) : "Never"}
                    </td>

                    <td className="px-3 py-2 text-right">
                      <Button
                        type="button"
                        variant="destructive-ghost"
                        size="icon-xs"
                        onClick={() => setDeletingVar(v)}
                        title="Delete variable"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="p-6 text-center text-xs text-muted-foreground">
            {searchQuery
              ? `No variables found matching "${searchQuery}"`
              : "No variables yet. A variable appears automatically when hardware reports it, or click “New variable” above."}
          </div>
        )}
      </div>

      <datalist id="unit-suggestions">
        {UNIT_OPTIONS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      <AlertDialog
        open={!!deletingVar}
        onOpenChange={(open) => !open && setDeletingVar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete variable &ldquo;{deletingVar?.key}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this variable? Widgets bound to
              this variable will stop updating.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDeleteVariable}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={createVarOpen} onOpenChange={setCreateVarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Variable</DialogTitle>
            <DialogDescription>
              Define a telemetry key to track sensor readings or actuator
              states.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateVariable} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-foreground">
                Key Name <span className="text-destructive">*</span>
              </label>
              <Input
                type="text"
                placeholder="e.g. temperature, soil_moisture, relay_pump"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                autoFocus
                required
                variant="mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-foreground">
                  Unit (Optional)
                </label>
                <Input
                  type="text"
                  list="unit-suggestions"
                  placeholder="e.g. °C, %, ppm"
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-foreground">
                  Initial Value (Optional)
                </label>
                <Input
                  type="text"
                  placeholder="e.g. 0, OFF"
                  value={newDefaultVal}
                  onChange={(e) => setNewDefaultVal(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateVarOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={creatingVar || !newKey.trim()}
              >
                {creatingVar ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function meta() {
  return [
    { title: "Variables — raina" },
    { name: "description", content: "Manage project telemetry variables and real-time sensor keys" },
  ];
}

export async function loader({ params, request }: { params: { proj: string }; request: Request }) {
  const proj = params.proj;
  const initialVariables = await getServerVariables(proj, request);
  return { proj, initialVariables };
}

export default function VariablesPage() {
  const { proj, initialVariables } = useLoaderData<typeof loader>();
  return <VariablesView proj={proj} initialVariables={initialVariables as any} />;
}
