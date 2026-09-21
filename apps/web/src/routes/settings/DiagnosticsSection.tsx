"use client";

import React, { useState } from "react";
import { getDiagnostics } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";

interface DiagnosticsSectionProps {
  initialDiagnostics?: any;
}

export function DiagnosticsSection({ initialDiagnostics }: DiagnosticsSectionProps) {
  const [diagnostics, setDiagnostics] = useState<any>(initialDiagnostics);
  const [loading, setLoading] = useState(false);

  // If no diagnostics data is provided or available, do not render this section
  if (!diagnostics) {
    return null;
  }

  const fetchDiagnostics = async () => {
    setLoading(true);
    try {
      const data = await getDiagnostics();
      setDiagnostics(data);
    } catch {
      // If unauthorized or failed, keep existing or set null
    } finally {
      setLoading(false);
    }
  };

  const formatUptime = (seconds?: number) => {
    if (seconds === undefined) return "—";
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  };

  const isDbHealthy = diagnostics.db?.status === "healthy";
  const rlpAvailable = diagnostics.rlp?.status === "managed-by-gateway";

  return (
    <section className="mb-4 rounded-sm border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
          System Service Status
        </div>
        <button
          type="button"
          onClick={fetchDiagnostics}
          disabled={loading}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer transition-colors"
        >
          <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
          <span>Check Status</span>
        </button>
      </div>

      <ul className="divide-y divide-border text-xs">
        <li className="flex items-center justify-between gap-3 px-3.5 py-2.5">
          <div className="min-w-0">
            <div className="font-medium text-foreground">
              Database ({diagnostics.db?.engine || "PostgreSQL"})
            </div>
            {diagnostics.db?.latencyMs !== undefined && (
              <div className="mt-0.5 text-xs text-muted-foreground font-mono">
                Ping latency: {diagnostics.db.latencyMs} ms
              </div>
            )}
          </div>
          <Badge
            variant={isDbHealthy ? "emerald" : "destructive"}
          >
            {isDbHealthy ? "Operational" : "Unavailable"}
          </Badge>
        </li>

        <li className="flex items-center justify-between gap-3 px-3.5 py-2.5">
          <div className="min-w-0">
            <div className="font-medium text-foreground">
              RLP device gateway
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Direct device transport. Dashboard realtime uses the API WebSocket separately.
            </div>
          </div>
          <Badge
            variant={rlpAvailable ? "emerald" : "destructive"}
          >
            {rlpAvailable ? "Available" : "Unavailable"}
          </Badge>
        </li>

        {diagnostics.system?.uptimeSeconds !== undefined && (
          <li className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <div className="min-w-0">
              <div className="font-medium text-foreground">
                Backend Server
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Uptime: {formatUptime(diagnostics.system.uptimeSeconds)}
              </div>
            </div>
            <Badge variant="emerald">
              Online
            </Badge>
          </li>
        )}
      </ul>
    </section>
  );
}
