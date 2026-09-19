"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Check, Copy } from "lucide-react";

interface HardwareEndpointsSectionProps {
  initialEndpoints?: {
    mqtt?: string;
    ws?: string;
    http?: string;
  };
}

export function HardwareEndpointsSection({ initialEndpoints }: HardwareEndpointsSectionProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [endpoints, setEndpoints] = useState({
    mqtt: initialEndpoints?.mqtt || "",
    ws: initialEndpoints?.ws || "",
    http: initialEndpoints?.http || "",
  });

  useEffect(() => {
    if (initialEndpoints?.mqtt && initialEndpoints?.http) {
      setEndpoints({
        mqtt: initialEndpoints.mqtt,
        ws: initialEndpoints.ws || "",
        http: initialEndpoints.http,
      });
      return;
    }

    // Dynamically request endpoints from Hono backend
    fetch("/v1/public/endpoints")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.mqtt && data?.http) {
          setEndpoints({
            mqtt: data.mqtt,
            ws: data.ws || "",
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
    <section className="mb-4 rounded-sm border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="border-b border-neutral-100 px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-neutral-800 dark:text-neutral-400 font-mono">
        Hardware Connection Endpoints
      </div>

      <ul className="divide-y divide-neutral-100 text-xs dark:divide-neutral-800">
        <li className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-3.5 py-2.5">
          <div className="min-w-0">
            <div className="font-medium text-neutral-900 dark:text-neutral-100">
              Native MQTT Broker
            </div>
            <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
              Direct TCP connection for ESP32, Arduino, and embedded hardware (Port 1883)
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <code className="rounded-xs bg-neutral-100 px-2 py-0.5 font-mono text-xs text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200">
              {endpoints.mqtt || "—"}
            </code>
            {endpoints.mqtt && (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => handleCopy(endpoints.mqtt, "mqtt")}
                className="gap-1"
              >
                {copiedKey === "mqtt" ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-500" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copy</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </li>

        <li className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-3.5 py-2.5">
          <div className="min-w-0">
            <div className="font-medium text-neutral-900 dark:text-neutral-100">
              WebSocket MQTT Stream
            </div>
            <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
              Browser-based MQTT stream for web clients and reverse proxies (Port 8083)
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <code className="rounded-xs bg-neutral-100 px-2 py-0.5 font-mono text-xs text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200">
              {endpoints.ws || "—"}
            </code>
            {endpoints.ws && (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => handleCopy(endpoints.ws, "ws")}
                className="gap-1"
              >
                {copiedKey === "ws" ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-500" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copy</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </li>

        <li className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-3.5 py-2.5">
          <div className="min-w-0">
            <div className="font-medium text-neutral-900 dark:text-neutral-100">
              HTTP Telemetry Ingestion
            </div>
            <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
              REST endpoint (Header: <code className="font-mono text-[11px]">x-device-token: &lt;token&gt;</code>)
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <code className="rounded-xs bg-neutral-100 px-2 py-0.5 font-mono text-xs text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200">
              {endpoints.http || "—"}
            </code>
            {endpoints.http && (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => handleCopy(endpoints.http, "http")}
                className="gap-1"
              >
                {copiedKey === "http" ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-500" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
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
