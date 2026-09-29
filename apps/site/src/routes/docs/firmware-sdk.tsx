export default function FirmwareSdkDoc() {
  return (
    <article className="max-w-3xl space-y-6">
      <div>
        <span className="text-[10px] font-mono uppercase tracking-widest text-primary font-bold block mb-1">
          Embedded Firmware
        </span>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          Arduino & ESP Client SDK
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Official C++ client library for ESP32 and ESP8266 boards using Raina Link Protocol.
        </p>
      </div>

      <section className="space-y-3 text-xs text-muted-foreground leading-relaxed">
        <h2 className="text-sm font-bold text-foreground border-b border-border pb-1.5">
          Installation
        </h2>

        <h3 className="text-xs font-bold text-foreground mt-2">PlatformIO</h3>
        <p>Add the repository directly to your <code className="text-lime-700 font-mono">platformio.ini</code>:</p>
        <pre className="p-3 rounded-xs bg-slate-900 border border-slate-800 text-xs font-mono text-slate-100">
          <code>{`lib_deps =
    https://github.com/mengsokool/raina.git#main:sdks/arduino`}</code>
        </pre>

        <h3 className="text-xs font-bold text-foreground mt-3">Arduino IDE</h3>
        <p>
          Download the <code className="text-lime-700 font-mono">sdks/arduino</code> folder as a ZIP file, then install it in Arduino IDE via <strong>Sketch &gt; Include Library &gt; Add .ZIP Library...</strong>
        </p>
        <div className="p-2.5 bg-accent text-accent-foreground border border-border rounded-xs text-[11px] font-mono">
          ✓ Zero external library dependencies required (no ArduinoJson or external MQTT client needed).
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-foreground border-b border-border pb-1.5">
          Basic Example (ESP32)
        </h2>
        <pre className="p-3.5 rounded-xs bg-slate-900 border border-slate-800 text-xs font-mono text-slate-100 leading-relaxed overflow-x-auto">
          <code>{`#include <Raina.h>

const char* WIFI_SSID     = "MyWiFi_2.4G";
const char* WIFI_PASS     = "SecretPass";
const char* RAINA_HOST    = "192.168.1.50";            // Server Host or IP
const char* PROJECT_TOKEN = "tok_H27q5wBayqo2QdOcyBW"; // Device Token from dashboard
const char* DEVICE_ID     = "esp32-greenhouse-01";     // Unique Device Identifier
const uint16_t RAINA_PORT = 9000;                      // 9000 TCP / 8883 TLS

// Actuator Downlink: Listens for dashboard button or slider changes
RAINA_ON("water_pump") {
  bool active = value.asBool();
  digitalWrite(18, active ? HIGH : LOW);

  // Echo state back to cloud to synchronize all connected dashboards
  Raina.send("water_pump", active);
}

void setup() {
  Serial.begin(115200);
  pinMode(18, OUTPUT);

  // Initialize WiFi and RLP binary socket connection
  Raina.begin(WIFI_SSID, WIFI_PASS, RAINA_HOST, PROJECT_TOKEN, DEVICE_ID, RAINA_PORT);
}

void loop() {
  // Keeps socket alive, auto-reconnects, and processes cloud commands
  Raina.run();

  static unsigned long lastReading = 0;
  if (millis() - lastReading >= 3000) {
    lastReading = millis();

    // Multi-metric telemetry sent in a single atomic RLP binary batch
    Raina.send(
      "temperature",   27.8,
      "humidity",      68.4,
      "soil_moisture", 55.0
    );
  }
}`}</code>
        </pre>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-foreground border-b border-border pb-1.5">
          API Reference Summary
        </h2>
        <div className="overflow-x-auto rounded-sm border border-border bg-card">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted text-foreground border-b border-border">
              <tr>
                <th className="p-2.5 font-bold font-mono">Method</th>
                <th className="p-2.5 font-bold">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-[11px]">
              <tr>
                <td className="p-2.5 text-primary font-mono font-bold">Raina.begin(ssid, pass, host, token, id, port)</td>
                <td className="p-2.5 text-muted-foreground">Initialize network and RLP connection credentials.</td>
              </tr>
              <tr>
                <td className="p-2.5 text-primary font-mono font-bold">Raina.run()</td>
                <td className="p-2.5 text-muted-foreground">Non-blocking background loop handling socket, heartbeats, and commands.</td>
              </tr>
              <tr>
                <td className="p-2.5 text-primary font-mono font-bold">Raina.send(key, value)</td>
                <td className="p-2.5 text-muted-foreground">Queue a single metric into the current auto-flush cycle.</td>
              </tr>
              <tr>
                <td className="p-2.5 text-primary font-mono font-bold">Raina.send(k1, v1, k2, v2, ...)</td>
                <td className="p-2.5 text-muted-foreground">Send 2 or more metrics in a single atomic binary batch.</td>
              </tr>
              <tr>
                <td className="p-2.5 text-primary font-mono font-bold">RAINA_ON(variable)</td>
                <td className="p-2.5 text-muted-foreground">Macro callback triggered when cloud sends an actuator command.</td>
              </tr>
              <tr>
                <td className="p-2.5 text-primary font-mono font-bold">Raina.setCACert(pem)</td>
                <td className="p-2.5 text-muted-foreground">Configure root CA certificate for TLS port 8883 verification.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </article>
  );
}
