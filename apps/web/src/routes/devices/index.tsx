import React, { useState, useEffect } from "react";
import { useLoaderData } from "react-router";
import { Plus, Copy, Check, Cpu, Pencil, ChevronDown } from "lucide-react";
import { Device, ProjectToken } from "@/types";
import { listTokens, createToken, revokeToken, renameDevice, deleteDevice } from "@/lib/api-client";
import { getServerTokens } from "@/lib/server-loaders";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

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

function isOnline(lastSeen: number | null): boolean {
  if (!lastSeen) return false;
  const age = Date.now() / 1000 - (lastSeen > 1e11 ? lastSeen / 1000 : lastSeen);
  return age < 300;
}

interface DevicesTokensViewProps {
  proj: string;
  initialTokens: ProjectToken[];
}

export function DevicesTokensView({ proj, initialTokens }: DevicesTokensViewProps) {
  const [tokens, setTokens] = useState<ProjectToken[]>(initialTokens);
  const [loading, setLoading] = useState(false);
  const [, setLiveConnected] = useState(false);
  const [flashDevices, setFlashDevices] = useState<Record<string, number>>({});
  const [deviceStatusMap, setDeviceStatusMap] = useState<Record<string, "online" | "offline">>({});

  // Create Token Modal & Revealed Secret State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const [creatingToken, setCreatingToken] = useState(false);
  const [createdToken, setCreatedToken] = useState<{ name: string; token: string; id: string } | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  // Revoke Token Modal
  const [revokingToken, setRevokingToken] = useState<ProjectToken | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  // Device Renaming
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  // Forget Device Modal
  const [forgettingDevice, setForgettingDevice] = useState<Device | null>(null);

  // Tree collapse / expand state
  const [collapsedTokens, setCollapsedTokens] = useState<Record<string, boolean>>({});

  const toggleCollapse = (id: string) => {
    setCollapsedTokens((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const fetchData = async () => {
    try {
      const data = await listTokens(proj);
      setTokens(data as any);
    } catch (e) {
      console.error("Failed to load device token data", e);
    } finally {
      setLoading(false);
    }
  };

  // Real-time SSE live stream for device status
  useEffect(() => {
    if (!proj) return;

    let eventSource: EventSource | null = null;
    let retryTimeout: any = null;

    const connectStream = () => {
      try {
        eventSource = new EventSource(`/v1/projects/${proj}/stream`);

        eventSource.onopen = () => {
          setLiveConnected(true);
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const ts = data.timestamp
              ? data.timestamp > 1e11
                ? data.timestamp
                : data.timestamp * 1000
              : Date.now();

            if (data.type === "device_status" && data.deviceId) {
              const devId = data.deviceId;
              const isDevOnline = data.status === "online";
              const newLastSeen = isDevOnline ? ts : 0;

              setDeviceStatusMap((prev) => ({
                ...prev,
                [devId]: data.status,
              }));

              setFlashDevices((f) => ({
                ...f,
                [devId]: (f[devId] || 0) + 1,
              }));

              setTokens((prev) => {
                let found = false;
                const next = prev.map((t) => ({
                  ...t,
                  devices: (t.devices || []).map((d) => {
                    if (d.id === devId) {
                      found = true;
                      return { ...d, last_seen: newLastSeen };
                    }
                    return d;
                  }),
                }));

                // If device is newly provisioned, refresh the full tokens/device list
                if (!found) {
                  fetchData();
                }

                return next;
              });
            } else if (data.type === "telemetry" && data.deviceId) {
              const devId = data.deviceId;

              setDeviceStatusMap((prev) => ({
                ...prev,
                [devId]: "online",
              }));

              setFlashDevices((f) => ({
                ...f,
                [devId]: (f[devId] || 0) + 1,
              }));

              setTokens((prev) =>
                prev.map((t) => ({
                  ...t,
                  devices: (t.devices || []).map((d) =>
                    d.id === devId ? { ...d, last_seen: ts } : d
                  ),
                }))
              );
            }
          } catch (e) {}
        };

        eventSource.onerror = () => {
          setLiveConnected(false);
          eventSource?.close();
          retryTimeout = setTimeout(connectStream, 3000);
        };
      } catch (e) {
        setLiveConnected(false);
      }
    };

    connectStream();

    return () => {
      if (retryTimeout) clearTimeout(retryTimeout);
      eventSource?.close();
    };
  }, [proj]);

  // Periodic ticker so relative time ("just now", "1m ago") updates live
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(timer);
  }, []);

  const handleOpenCreateModal = () => {
    setCreatedToken(null);
    setTokenName("");
    setCopiedToken(false);
    setCreateModalOpen(true);
  };

  const handleCloseCreateModal = (open: boolean) => {
    if (!open) {
      setCreatedToken(null);
      setTokenName("");
      setCopiedToken(false);
    }
    setCreateModalOpen(open);
  };

  const handleCreateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingToken(true);
    try {
      const nameToSend = tokenName.trim();
      const data = await createToken(proj, { name: nameToSend || undefined });
      setCreatedToken({
        name: nameToSend || "Default",
        token: data.token,
        id: data.id,
      });
      setTokenName("");
      await fetchData();
    } catch (e) {
      console.error("Failed to create token", e);
    } finally {
      setCreatingToken(false);
    }
  };

  const handleRevokeToken = async () => {
    if (!revokingToken) return;
    setIsRevoking(true);
    const targetId = revokingToken.id;
    try {
      await revokeToken(proj, targetId);
      setTokens((prev) => prev.filter((t) => t.id !== targetId));
      setRevokingToken(null);
    } catch (e) {
      console.error("Failed to revoke token", e);
    } finally {
      setIsRevoking(false);
    }
  };

  const copyToken = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const handleStartRename = (device: Device) => {
    setEditingDeviceId(device.id);
    setDraftName(device.name);
  };

  const handleSaveRename = async (deviceId: string) => {
    if (!draftName.trim()) {
      setEditingDeviceId(null);
      return;
    }
    const next = draftName.trim();
    setTokens((prev) =>
      prev.map((t) => ({
        ...t,
        devices: (t.devices || []).map((d) => (d.id === deviceId ? { ...d, name: next } : d)),
      }))
    );
    setEditingDeviceId(null);

    try {
      await renameDevice(proj, deviceId, next);
    } catch (e) {
      console.error(e);
      await fetchData();
    }
  };

  const handleForgetDevice = async () => {
    if (!forgettingDevice) return;
    try {
      await deleteDevice(proj, forgettingDevice.id);
      setTokens((prev) =>
        prev.map((t) => ({
          ...t,
          devices: (t.devices || []).filter((d) => d.id !== forgettingDevice.id),
        }))
      );
      setForgettingDevice(null);
    } catch (e) {
      console.error("Failed to forget device", e);
    }
  };

  const totalDevices = tokens.reduce((acc, t) => acc + (t.devices?.length || 0), 0);

  return (
    <div className="mx-auto max-w-4xl px-2 py-3 sm:px-5 sm:py-6">
      {/* Minimal Header */}
      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            Devices
          </h1>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            {tokens.length} token{tokens.length === 1 ? "" : "s"} · {totalDevices} connected board{totalDevices === 1 ? "" : "s"}
          </p>
        </div>

        <Button
          type="button"
          onClick={handleOpenCreateModal}
          className="self-start sm:self-auto gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New token</span>
        </Button>
      </header>

      {/* Tree View: Token Roots -> Device Leaves */}
      <div className="space-y-3">
        {loading ? (
          <div className="space-y-2">
            <div className="h-20 animate-pulse rounded-sm bg-neutral-100 dark:bg-neutral-900" />
            <div className="h-20 animate-pulse rounded-sm bg-neutral-100 dark:bg-neutral-900" />
          </div>
        ) : tokens.length > 0 ? (
          tokens.map((t) => {
            const connectedDevices = t.devices || [];
            const isCollapsed = !!collapsedTokens[t.id];

            return (
              <div
                key={t.id}
                className="overflow-hidden rounded-sm border border-neutral-200 bg-white p-2.5 dark:border-neutral-800 dark:bg-neutral-900"
              >
                {/* Token Root Node (Click anywhere to expand/collapse) */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleCollapse(t.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleCollapse(t.id);
                    }
                  }}
                  className="flex items-center justify-between group cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {/* Expand/Collapse Chevron Indicator */}
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-200 transition-transform duration-200 ${
                        isCollapsed ? "-rotate-90" : "rotate-0"
                      }`}
                    />

                    {/* Token Name */}
                    <span className="font-semibold text-xs text-neutral-900 group-hover:text-neutral-700 dark:text-neutral-100 dark:group-hover:text-neutral-300 transition truncate">
                      {t.name || "Default Token"}
                    </span>

                    {/* Device count badge (only shown when collapsed) */}
                    {isCollapsed && connectedDevices.length > 0 && (
                      <Badge variant="secondary" className="rounded-xs px-1.5 py-0 text-[10px] font-mono">
                        {connectedDevices.length}
                      </Badge>
                    )}
                  </div>

                  {/* Token Actions */}
                  <div className="flex items-center shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRevokingToken(t);
                      }}
                      className="text-red-600 hover:text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-[11px]"
                    >
                      Revoke
                    </Button>
                  </div>
                </div>

                {/* Tree Branches & Leaf Nodes */}
                {!isCollapsed && (
                  <div className="relative ml-2.5 sm:ml-4 mt-2 space-y-1.5 pl-5 sm:pl-6">
                    {connectedDevices.length > 0 ? (
                      connectedDevices.map((d, idx) => {
                        const isLast = idx === connectedDevices.length - 1;
                        const online = deviceStatusMap[d.id]
                          ? deviceStatusMap[d.id] === "online"
                          : isOnline(d.last_seen);
                        const flashCount = flashDevices[d.id] || 0;

                        return (
                          <div key={d.id} className="relative group">
                            {/* Tree Trunk Vertical Line */}
                            <span
                              aria-hidden="true"
                              className={`absolute -left-5 sm:-left-6 top-0 ${
                                isLast ? "h-1/2" : "h-[calc(100%+6px)]"
                              } w-0 border-l border-neutral-200 dark:border-neutral-800`}
                            />

                            {/* Tree Horizontal Elbow Connector */}
                            <span
                              aria-hidden="true"
                              className="absolute -left-5 sm:-left-6 top-1/2 w-4 sm:w-5 border-t border-neutral-200 dark:border-neutral-800"
                            />

                            {/* Device Leaf Card */}
                            <div className="group/device flex items-center justify-between rounded-xs border border-neutral-200/70 bg-neutral-50/50 px-2.5 py-2 dark:border-neutral-800/70 dark:bg-neutral-950/40 hover:border-neutral-300 dark:hover:border-neutral-700 transition">
                              {/* Left: Device Icon & Name */}
                              <div className="flex min-w-0 flex-1 items-center gap-2">
                                <Cpu className="h-3.5 w-3.5 shrink-0 text-neutral-400 group-hover/device:text-neutral-600 dark:group-hover/device:text-neutral-200 transition-colors" />

                                <div className="min-w-0 flex-1">
                                  {editingDeviceId === d.id ? (
                                    <div className="flex items-center gap-1.5">
                                      <Input
                                        type="text"
                                        value={draftName}
                                        onChange={(e) => setDraftName(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") handleSaveRename(d.id);
                                          if (e.key === "Escape") setEditingDeviceId(null);
                                        }}
                                        onBlur={() => handleSaveRename(d.id)}
                                        autoFocus
                                        className="w-44 h-6 text-xs px-1.5"
                                      />
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-xs"
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          handleSaveRename(d.id);
                                        }}
                                        className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                        title="Save name"
                                      >
                                        <Check className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate">
                                        {d.name}
                                      </span>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-xs"
                                        onClick={() => handleStartRename(d)}
                                        className="opacity-0 group-hover/device:opacity-100 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                                        title="Rename device"
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Right: Actions on hover + Status Dot + Timestamp */}
                              <div className="flex items-center gap-2.5 shrink-0">
                                {/* Forget button (only on hover) */}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="xs"
                                  onClick={() => setForgettingDevice(d)}
                                  className="opacity-0 group-hover/device:opacity-100 text-[11px] text-neutral-400 hover:text-red-500"
                                >
                                  Forget
                                </Button>

                                {/* Minimal Status Dot */}
                                <span
                                  key={`dot-${d.id}-${flashCount}`}
                                  title={online ? "Online" : "Offline"}
                                  className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                    online
                                      ? `bg-emerald-500 ${flashCount > 0 ? "animate-activity-blink" : "opacity-40"}`
                                      : "bg-neutral-300 dark:bg-neutral-600"
                                  }`}
                                />

                                {/* Last seen timestamp */}
                                <span className="text-[11px] font-mono text-neutral-400 min-w-12 text-right">
                                  {d.last_seen ? relativeTime(d.last_seen) : "Never"}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="relative">
                        {/* Tree Trunk Dashed Branch */}
                        <span
                          aria-hidden="true"
                          className="absolute -left-5 sm:-left-6 top-0 h-1/2 w-0 border-l border-dashed border-neutral-300 dark:border-neutral-700"
                        />
                        {/* Tree Elbow Connector */}
                        <span
                          aria-hidden="true"
                          className="absolute -left-5 sm:-left-6 top-1/2 w-4 sm:w-5 border-t border-dashed border-neutral-300 dark:border-neutral-700"
                        />
                        <div className="rounded-xs border border-dashed border-neutral-200 bg-neutral-50/40 p-2.5 text-xs text-neutral-400 dark:border-neutral-800 dark:bg-neutral-950/20">
                          No devices connected to this token yet. Configure your hardware firmware with this token to connect.
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="rounded-sm border border-dashed border-neutral-300 p-6 text-center text-xs text-neutral-400 dark:border-neutral-800">
            No tokens created yet. Click “New token” above to connect your devices.
          </div>
        )}
      </div>

      {/* Create / Reveal Token Modal (Single Unified Dialog) */}
      <Dialog open={createModalOpen} onOpenChange={handleCloseCreateModal}>
        <DialogContent>
          {createdToken ? (
            <>
              <DialogHeader>
                <DialogTitle>Created &ldquo;{createdToken.name}&rdquo; Key</DialogTitle>
                <DialogDescription>
                  Make sure to copy this token now. You won&apos;t be able to see it again.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    readOnly
                    value={createdToken.token}
                    className="flex-1 font-mono text-xs select-all"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => copyToken(createdToken.token)}
                    className="gap-1.5"
                  >
                    {copiedToken ? <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedToken ? "Copied!" : "Copy"}</span>
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  onClick={() => handleCloseCreateModal(false)}
                >
                  Dismiss
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Create Token</DialogTitle>
                <DialogDescription>
                  Name your token to organize your boards (e.g. Greenhouse 1, Pump Controller).
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateToken} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    Token Name
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. Sensors Token, Irrigation Token"
                    value={tokenName}
                    onChange={(e) => setTokenName(e.target.value)}
                    autoFocus
                  />
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleCloseCreateModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={creatingToken}
                  >
                    {creatingToken ? "Creating..." : "Create"}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Revoke Token Modal */}
      <Dialog open={!!revokingToken} onOpenChange={(open) => !open && setRevokingToken(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke Token?</DialogTitle>
            <DialogDescription>
              Are you sure you want to revoke &ldquo;{revokingToken?.name || revokingToken?.id}&rdquo;? Connected devices will lose access.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRevokingToken(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleRevokeToken}
              disabled={isRevoking}
            >
              {isRevoking ? "Revoking..." : "Revoke"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Forget Device Modal */}
      <Dialog open={!!forgettingDevice} onOpenChange={(open) => !open && setForgettingDevice(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Forget Device &ldquo;{forgettingDevice?.name}&rdquo;?</DialogTitle>
            <DialogDescription>
              This removes the device registration. It will be rediscovered if it reports again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setForgettingDevice(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleForgetDevice}
            >
              Forget
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function meta() {
  return [
    { title: "Devices & Tokens — raina" },
    { name: "description", content: "Manage project devices and hardware connection tokens" },
  ];
}

export async function loader({ params, request }: { params: { proj: string }; request: Request }) {
  const proj = params.proj;
  const initialTokens = await getServerTokens(proj, request);
  return { proj, initialTokens };
}

export default function DeviceTokensPage() {
  const { proj, initialTokens } = useLoaderData<typeof loader>();
  return <DevicesTokensView proj={proj} initialTokens={initialTokens as any} />;
}
