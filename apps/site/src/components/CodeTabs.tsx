import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight, Check, Copy } from "lucide-react";

type Snippet = "arduino" | "http" | "deploy";

const snippets: Record<Snippet, { label: string; code: string }> = {
  arduino: {
    label: "ESP32 / Arduino",
    code: `#include <Raina.h>

const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASS = "YOUR_PASSWORD";
const char* RAINA_HOST = "YOUR_SERVER_IP";
const char* PROJECT_TOKEN = "YOUR_PROJECT_TOKEN";
const char* DEVICE_ID = "esp32-greenhouse-01";

void setup() {
  Raina.begin(WIFI_SSID, WIFI_PASS, RAINA_HOST,
              PROJECT_TOKEN, DEVICE_ID, 9000);
}

void loop() {
  Raina.run();
  static unsigned long lastSend = 0;
  if (millis() - lastSend >= 3000) {
    lastSend = millis();
    Raina.send("temperature", 28.4);
  }
}`,
  },
  http: {
    label: "HTTP REST",
    code: `curl -X POST http://localhost:3001/v1/telemetry \\
  -H "Content-Type: application/json" \\
  -H "x-device-token: YOUR_PROJECT_TOKEN" \\
  -d '{
    "device_id": "sensor_node_01",
    "metrics": { "temperature": 28.4 }
  }'`,
  },
  deploy: {
    label: "Self-host",
    code: `git clone https://github.com/mengsokool/raina.git
cd raina
docker compose up -d

# Open http://localhost:3000 to create an account`,
  },
};

export function CodeTabs() {
  const [active, setActive] = useState<Snippet>("arduino");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(snippets[active].code);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
    window.setTimeout(() => setCopyState("idle"), 2200);
  }

  return (
    <section id="quickstart" className="bg-card py-20 sm:py-28">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-8 lg:grid-cols-[0.65fr_1.35fr] lg:gap-16">
        <div>
          <h2 className="max-w-[13ch] font-display text-4xl font-semibold leading-[1.08] tracking-[-0.055em] text-foreground sm:text-5xl">
            Start where you build.
          </h2>
          <p className="mt-5 max-w-[40ch] text-base leading-relaxed text-muted-foreground">
            Use the Arduino SDK, send telemetry over HTTP, or run Raina on your own host.
          </p>
          <Link
            to="/docs/sdk"
            className="mt-8 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          >
            Firmware SDK <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>

        <div className="min-w-0 overflow-hidden rounded-md border border-slate-800 bg-[#0f172a] shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 bg-[#1e293b]/70 px-4 py-2.5 sm:px-5">
            <div role="tablist" aria-label="Quickstart example" className="flex flex-wrap items-center gap-1.5">
              {(Object.keys(snippets) as Snippet[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active === key}
                  aria-controls="raina-code-panel"
                  onClick={() => { setActive(key); setCopyState("idle"); }}
                  className={`rounded-xs px-3 py-1.5 text-xs font-mono transition-colors ${
                    active === key
                      ? "bg-slate-800 text-lime-400 font-bold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {snippets[key].label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={copyCode}
              aria-label={`Copy ${snippets[active].label} example`}
              className="inline-flex h-8 items-center gap-1.5 rounded-xs px-2.5 text-xs font-mono text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 focus-visible:outline-2 focus-visible:outline-lime-400"
            >
              {copyState === "copied" ? <Check className="size-3.5 text-lime-400" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
              {copyState === "copied" ? "Copied" : copyState === "error" ? "Failed" : "Copy"}
            </button>
          </div>
          <div id="raina-code-panel" role="tabpanel" className="min-h-[300px] overflow-x-auto px-5 py-6 sm:px-7">
            <pre className="font-mono text-[12px] leading-[1.85] text-slate-200 sm:text-[13px]"><code>{snippets[active].code}</code></pre>
          </div>
        </div>
      </div>
    </section>
  );
}
