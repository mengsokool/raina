"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Check, Copy } from "lucide-react";

interface HardwareEndpointsSectionProps {
  initialEndpoints?: {
    rlp?: string;
    http?: string;
  };
}

export function HardwareEndpointsSection({ initialEndpoints }: HardwareEndpointsSectionProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [endpoints, setEndpoints] = useState({
    rlp: initialEndpoints?.rlp || "",
    http: initialEndpoints?.http || "",
  });

  useEffect(() => {
    if (initialEndpoints?.rlp && initialEndpoints?.http) {
      setEndpoints({
        rlp: initialEndpoints.rlp,
        http: initialEndpoints.http,
      });
      return;
    }

    // Dynamically request endpoints from Hono backend
    fetch("/v1/public/endpoints")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.rlp && data?.http) {
          setEndpoints({
            rlp: data.rlp,
            http: data.http,
          });
        }
      })
      .catch(() => {});
  }, [initialEndpoints]);

  const handleCopy = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  return (
    <section className="mb-4 rounded-sm border border-border bg-card">
      <div className="border-b border-border px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
        Hardware Connection Endpoints
      </div>

      <ul className="divide-y divide-border text-xs">
        <li className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-3.5 py-2.5">
          <div className="min-w-0">
            <div className="font-medium text-foreground">
              RLP device gateway
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Authenticated TLS connection for ESP32, Arduino, and embedded hardware
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <code className="rounded-xs bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
              {endpoints.rlp || "—"}
            </code>
            {endpoints.rlp && (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => handleCopy(endpoints.rlp, "rlp")}
              >
                {copiedKey === "rlp" ? (
                  <>
                    <Check className="size-3 text-primary" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3" />
                    <span>Copy</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </li>

        <li className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-3.5 py-2.5">
          <div className="min-w-0">
            <div className="font-medium text-foreground">
              HTTP Telemetry Ingestion
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              REST endpoint (Header: <code className="font-mono text-xs">x-device-token: &lt;token&gt;</code>)
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <code className="rounded-xs bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
              {endpoints.http || "—"}
            </code>
            {endpoints.http && (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => handleCopy(endpoints.http, "http")}
              >
                {copiedKey === "http" ? (
                  <>
                    <Check className="size-3 text-primary" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3" />
                    <span>Copy</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </li>
      </ul>
    </section>
  );
}
