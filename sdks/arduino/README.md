# Raina Arduino Client Library

An enterprise-grade, high-performance C++ client library for **ESP32** and **ESP8266** microcontrollers, engineered specifically for the **Raina IoT Cloud Operating System**.

This SDK decouples application business logic from underlying transport complexities. It encapsulates industrial MQTT connectivity (EMQX 5.x), dual-band multi-AP Wi-Fi failover, scheduled reconnection, Last Will and Testament (LWT) lifecycle signaling, duplicate-command suppression, and batched telemetry serialization into an ergonomic API.

---

## Table of Contents

1. [Architecture & Design Philosophy](#architecture--design-philosophy)
2. [Supported Platforms & Dependencies](#supported-platforms--dependencies)
3. [Installation](#installation)
   - [PlatformIO](#platformio)
   - [Arduino IDE](#arduino-ide)
4. [Quick Start](#quick-start)
5. [Core Concepts](#core-concepts)
   - [1. Non-Blocking Execution Model](#1-non-blocking-execution-model)
   - [2. Inbound Actuator Commands (`RAINA_ON`)](#2-inbound-actuator-commands-raina_on)
   - [3. Type-Safe Variant Extraction (`RainaValue`)](#3-type-safe-variant-extraction-rainavalue)
   - [4. Outbound Telemetry Ingestion (Zero-Flush Engine)](#4-outbound-telemetry-ingestion-zero-flush-engine)
6. [Wire Protocol & Topic Taxonomy](#wire-protocol--topic-taxonomy)
7. [Security & Production Hardening](#security--production-hardening)
   - [Transport Layer Security (MQTTS)](#transport-layer-security-mqtts)
   - [Multi-Tenant Isolation & Identity](#multi-tenant-isolation--identity)
8. [Comprehensive API Reference](#comprehensive-api-reference)
   - [Lifecycle & Networking](#lifecycle--networking)
   - [Actuators & Commands](#actuators--commands)
   - [Telemetry Publishing](#telemetry-publishing)
   - [Security & Diagnostics](#security--diagnostics)
9. [Diagnostic & Error Codes](#diagnostic--error-codes)
10. [Unit & Integration Testing](#unit--integration-testing)
11. [License](#license)

---

## Architecture & Design Philosophy

Traditional embedded IoT firmware typically mixes low-level transport management (TCP handshakes, MQTT keep-alives, Wi-Fi polling, JSON buffer parsing) with critical physical actuator logic. This coupling introduces deadlocks, loop starvation caused by blocking `delay()` or socket reconnection routines, and state desynchronization.

The **Raina Arduino SDK** enforces strict separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                    Developer Firmware                       │
│    RAINA_ON("pump") { ... }   │   Raina.send("temp", 28.5)  │
└──────────────────────────────┬──────────────────────────────┘
                               │ High-Level Ergonomic API
┌──────────────────────────────▼──────────────────────────────┐
│                    Raina SDK Core Engine                    │
│  - Static Dispatch Registry  │  - Zero-Flush Memory Buffer  │
│  - Duplicate Command Cache   │  - Type-Safe JsonVariant     │
│  - Scheduled Reconnect       │  - LWT Status Publisher      │
└──────────────────────────────┬──────────────────────────────┘
                               │ Transport Abstraction
┌──────────────────────────────▼──────────────────────────────┐
│  PubSubClient (MQTT 3.1.1)   │  WiFiMulti / WiFiClient      │
│  TCP Port 1883 / TLS 8883    │  Auto-Healing Reconnect      │
└──────────────────────────────┬──────────────────────────────┘
                               │ Encrypted IP Network
┌──────────────────────────────▼──────────────────────────────┐
│                 Raina Cloud (EMQX 5 Broker)                 │
└─────────────────────────────────────────────────────────────┘
```

### Key Engineering Guarantees:
- **Responsive startup:** `begin()` only configures the client; connection attempts start when `Raina.run()` is called.
- **Zero-Flush Telemetry Pipeline:** Outgoing metrics queued during a program cycle are aggregated in an in-memory buffer and dispatched as a unified JSON payload when `Raina.run()` executes.
- **Single Source of Truth:** Hardware echoes internal relay/actuator state directly back to the project variable store upon command receipt.

---

## Supported Platforms & Dependencies

### Target Microcontrollers
- **Espressif ESP32 Series:** ESP32-WROOM, ESP32-WROVER, ESP32-S2, ESP32-S3, ESP32-C3, ESP32-C6.
- **Espressif ESP8266 Series:** NodeMCU v2/v3, WeMos D1 Mini, ESP-12E/F.
- **Generic Arduino Architectures:** Any board providing a standard `Client` network implementation (e.g., Ethernet W5500, Portenta).

### Required Libraries
| Library | Minimum Version | Purpose |
| :--- | :--- | :--- |
| **[ArduinoJson](https://arduinojson.org/)** | `v6.20.0` or `v7.x` | JSON serialization and payload deserialization. |
| **[PubSubClient](https://github.com/knolleary/pubsubclient)** | `v2.8.0` | Standard MQTT 3.1.1 transport client. |

---

## Installation

### PlatformIO

Add the dependencies and the library path into your project's `platformio.ini`:

```ini
[env:esp32dev]
platform = espressif32
board = esp32dev
framework = arduino
monitor_speed = 115200
lib_deps =
    bblanchon/ArduinoJson @ ^7.0.0
    knolleary/PubSubClient @ ^2.8
    # Point to the local package or your git repository:
    https://github.com/your-org/raina.git#main:sdks/arduino
```

### Arduino IDE

1. Download the `sdks/arduino` folder as a `.zip` archive.
2. In the Arduino IDE, navigate to:  
   **Sketch** $\rightarrow$ **Include Library** $\rightarrow$ **Add .ZIP Library...**
3. Open Library Manager (**Sketch** $\rightarrow$ **Include Library** $\rightarrow$ **Manage Libraries...**) and install:
   - `ArduinoJson` (by Benoît Blanchon)
   - `PubSubClient` (by Nick O'Leary)

---

## Quick Start

The following production-ready example configures a digital actuator and publishes periodic multi-sensor telemetry:

```cpp
#include <Raina.h>

// ── Network & Project Configuration ──────────────────────────────────────────
const char* WIFI_SSID     = "Farm_Access_Point";
const char* WIFI_PASS     = "IndustrialSecurePassword";
const char* RAINA_HOST    = "192.168.1.50";              // Raina server IP or hostname
const char* PROJECT_ID    = "proj_farm_01";              // Raina Project Identifier
const char* PROJECT_TOKEN = "YOUR_HARDWARE_TOKEN"; // Project Hardware Token
const char* DEVICE_ID     = "esp32_greenhouse_01";       // Unique Hardware Device Key
const uint16_t RAINA_PORT = 1883;                        // 1883 (TCP) or 8883 (TLS)

// ── Hardware Pin Allocations ──────────────────────────────────────────────────
const int PIN_RELAY_PUMP = 18;
const int PIN_STATUS_LED = 2;

// ── Actuator Callback: Executed when user toggles Dashboard switch ───────────
RAINA_ON("pump_relay") {
  bool requestedState = value.asBool();
  digitalWrite(PIN_RELAY_PUMP, requestedState ? HIGH : LOW);

  // Echo state back to synchronize dashboard visual controls instantly
  Raina.send("pump_relay", requestedState ? 1 : 0);
}

void setup() {
  Serial.begin(115200);

  pinMode(PIN_RELAY_PUMP, OUTPUT);
  pinMode(PIN_STATUS_LED, OUTPUT);
  digitalWrite(PIN_RELAY_PUMP, LOW);

  // Optional: Connection lifecycle events
  Raina.onConnect([]() {
    digitalWrite(PIN_STATUS_LED, HIGH);
  });
  Raina.onDisconnect([]() {
    digitalWrite(PIN_STATUS_LED, LOW);
  });

  // Enable verbose Serial diagnostic logging
  Raina.setDebug(true);

  // Initialize network interfaces and MQTT broker connection
  Raina.begin(WIFI_SSID, WIFI_PASS, RAINA_HOST, PROJECT_ID, PROJECT_TOKEN, DEVICE_ID, RAINA_PORT);
}

void loop() {
  // Must be called on every iteration: maintains WiFi, MQTT, and auto-flushes telemetry
  Raina.run();

  // Periodic Telemetry Ingestion (Non-blocking timer)
  static unsigned long lastTelemetry = 0;
  if (millis() - lastTelemetry >= 5000) {
    lastTelemetry = millis();

    float tempC       = 28.4; // Replace with sensor read (e.g., DHT22/SHT31)
    float humidityPct = 65.2;
    float soilMoist   = 58.0;

    // Dispatch all metrics unified in a single MQTT packet (No .flush() required)
    Raina.send(
      "temperature",   tempC,
      "humidity",      humidityPct,
      "soil_moisture", soilMoist,
      "uptime_s",      (long)(millis() / 1000)
    );
  }
}
```

---

## Core Concepts

### 1. Non-Blocking Execution Model

The library schedules Wi-Fi and MQTT reconnection attempts via `Raina.run()`:

- If the Wi-Fi link drops, `Raina.run()` schedules reconnection attempts every 4 seconds.
- If the MQTT broker drops or reboots, `Raina.run()` automatically executes an exponential/fixed backoff reconnection routine.
- Keep-alive pings (every 30 seconds) are handled transparently to keep state active in EMQX.

`begin()` itself never waits for Wi-Fi. Individual Wi-Fi or MQTT driver calls may still take time according to the networking stack, so firmware with hard real-time deadlines should keep actuator timing out of `Raina.run()` and use the platform's watchdog guidance.

### 2. Inbound Actuator Commands (`RAINA_ON`)

To register a hardware response to cloud commands, use the declarative `RAINA_ON` macro at file scope:

```cpp
RAINA_ON("ventilation_fan") {
  int dutyCyclePercent = value.asInt();
  int pwmValue = map(dutyCyclePercent, 0, 100, 0, 255);
  analogWrite(PIN_FAN_PWM, pwmValue);
}
```

#### How it Works:
- `RAINA_ON` statically registers the variable key into a linked list before `setup()` runs.
- When the cloud server dispatches a downlink command via MQTT, the SDK parses the envelope, identifies the target key, and routes execution directly to your callback.
- Alternative aliases: `RAINA_COMMAND(var)` and `RAINA_WRITE(var)`.

### 3. Type-Safe Variant Extraction (`RainaValue`)

Incoming parameters are encapsulated in the `RainaValue` class, allowing robust and defensive type casting regardless of whether the UI sends a boolean, string, or number:

```cpp
RAINA_ON("valve_open") {
  // Truthy parsing: Handles true, 1, "1", "true", "on", "yes"
  bool state = value.asBool();

  // Integral numbers
  int stateInt = value.asInt();
  long stateLong = value.asLong();

  // Floating-point metrics
  float speed = value.asFloat();
  double preciseVal = value.asDouble();

  // String payloads (e.g. hex colors, JSON strings, modes)
  String mode = value.asString();

  // Null verification
  if (value.isNull()) { /* ... */ }
}
```

### 4. Outbound Telemetry Ingestion (Zero-Flush Engine)

The SDK provides two flexible modalities for publishing sensor data:

#### Modality A: Variadic One-Liner (Recommended)
Transmits multiple heterogeneous metrics atomically in a single MQTT transmission frame:
```cpp
Raina.send("temperature", 28.5, "humidity", 65.0, "soil_ec", 1.45);
```

#### Modality B: Sequential Staging with Auto-Flush
Metrics can be accumulated sequentially across multiple subroutines. `Raina.run()` automatically flushes the staged payload at the end of the loop:
```cpp
void readSensors() {
  Raina.send("soil_temp", 24.1);
  Raina.send("soil_moist", 62.0);
  // No .flush() needed! Raina.run() bundles and transmits these automatically.
}
```

---

## Wire Protocol & Topic Taxonomy

The Raina platform enforces strict multi-tenant topic isolation inside the EMQX broker. The SDK automatically maps topics according to platform specifications:

| Direction | Topic Taxonomy | Payload Format | Description |
| :--- | :--- | :--- | :--- |
| **Uplink** | `v1/{projectId}/devices/{deviceId}/telemetry` | `{"temp":28.5,"hum":65}` | Raw time-series metrics. |
| **Uplink** | `projects/{projectId}/devices/{deviceId}/status` | `{"status":"online"}` | Live connection state heartbeat. |
| **LWT** | `projects/{projectId}/devices/{deviceId}/status` | `{"status":"offline"}` | Last Will broker broadcast on abrupt disconnect. |
| **Downlink** | `v1/{projectId}/devices/{deviceId}/commands` | `{"cmd_id":"...","relay":1}` | Actuator control frame from Dashboard/API. |
| **Downlink** | `projects/{projectId}/devices/{deviceId}/control` | `{"variable":"relay","value":1}` | Legacy fallback control channel. |

---

## Security & Production Hardening

### Transport Layer Security (MQTTS)

For deployments operating over public WAN networks or cellular gateways, plaintext MQTT (Port 1883) should not be used. Configure encrypted TLS over port 8883:

TLS certificate validation is required by default. On ESP32 configure a root CA with `setCACert()`; on ESP8266 configure a fingerprint with `setFingerprint()`. `setInsecure()` is an explicit development-only opt-out and must never be used for production devices.

```cpp
// Option 1: Development / Staging with self-signed certificate (Unvalidated TLS)
Raina.setSecure(true);
Raina.setInsecure();
Raina.begin(WIFI_SSID, WIFI_PASS, "mqtt.yourfarm.com", PROJECT_ID, TOKEN, DEVICE_ID, 8883);

// Option 2: Enterprise Production with Root CA pinning
const char* RAINA_ROOT_CA = 
  "-----BEGIN CERTIFICATE-----\n"
  "MIIEkjCCA3qgAwIBAgIQCgFBQgAAAVOFc2oLheynCDANBgkqhkiG9w0BAQsFADA7...\n"
  "-----END CERTIFICATE-----\n";

Raina.setCACert(RAINA_ROOT_CA);
Raina.begin(WIFI_SSID, WIFI_PASS, "mqtt.yourfarm.com", PROJECT_ID, TOKEN, DEVICE_ID, 8883);
```

### Multi-Tenant Isolation & Identity
- **Client ID Binding:** The client uses `DEVICE_ID` as its MQTT ClientID. The EMQX webhook strictly prohibits a device from publishing or subscribing to topics outside of its own project and device ID scope.
- **Duplicate-command suppression:** When a downlink payload includes a `cmd_id`, the SDK keeps a bounded in-memory cache and ignores repeat deliveries of that ID. This covers the platform's modern/legacy topic compatibility copies; it does not persist across device restarts.

---

## Comprehensive API Reference

### Lifecycle & Networking

```cpp
void addAP(const char* ssid, const char* pass);
```
Registers an access point with the Wi-Fi client. When called multiple times, the underlying `WiFiMulti` driver automatically selects the access point with the strongest RSSI.

```cpp
void begin(const char* ssid, const char* pass, const char* host,
           const char* projectId, const char* token, const char* deviceId,
           uint16_t port = 1883);
```
Initializes Wi-Fi configuration and MQTT parameters without waiting for a connection. Call `Raina.run()` from `loop()` to start Wi-Fi and MQTT connection attempts.

```cpp
void begin(const char* host, const char* projectId, const char* token,
           const char* deviceId, uint16_t port = 1883);
```
Initializes Raina when Wi-Fi is already initialized by custom application code.

```cpp
void run();
```
Core client processing loop. Must be invoked within Arduino `void loop()`. Handles Wi-Fi status monitoring, MQTT packet processing, ping heartbeats, and auto-flushing staged telemetry.

---

### Actuators & Commands

```cpp
RAINA_ON(const char* variable) { ... }
```
Declarative static registration macro. Receives a `RainaValue value` parameter inside the block scope.

```cpp
void onWrite(const char* variable, void (*callback)(RainaValue value));
```
Imperative runtime alternative to `RAINA_ON` for registering callbacks dynamically.

---

### Telemetry Publishing

```cpp
template <typename... Args>
bool send(Args... keyValues);
```
Variadic multi-metric publisher. Accepts pairs of `(key, value)`. Serializes and transmits all arguments immediately in one MQTT payload.

```cpp
void send(const char* variable, T value);
```
Queues a single metric (supports `bool`, `int`, `long`, `float`, `double`, `const char*`, `String`) into the active memory buffer. Auto-flushed by `run()`.

```cpp
template <typename T>
bool sendNow(const char* variable, T value);
```
Immediately transmits a single key-value metric over MQTT without waiting for the loop cycle to finish.

```cpp
bool flush();
```
Manually triggers an immediate transmission of all queued metrics in the staging buffer. Returns `true` if successful.

---

### Security & Diagnostics

```cpp
void setDebug(bool on = true);
```
Enables or disables formatted diagnostic messages printed to `Serial`.

```cpp
void setSecure(bool secure = true);
void setCACert(const char* rootCaPem);
void setInsecure();
```
Configures TLS/MQTTS operation, certificate pinning, or bypasses verification for internal development brokers.

```cpp
void setBufferSize(uint16_t size);
```
Overrides the default MQTT packet buffer size (default: 1024 bytes).

```cpp
void onConnect(void (*callback)());
void onDisconnect(void (*callback)());
```
Registers lifecycle hooks executed when the MQTT broker connection is established or interrupted.

---

## Diagnostic & Error Codes

When `Raina.setDebug(true)` is set, connection errors output specific diagnostic indicators:

| MQTT State Code | Symbol | Root Cause & Resolution |
| :---: | :--- | :--- |
| **`4`** | `MQTT_CONNECT_BAD_CREDENTIALS` | The `PROJECT_TOKEN` or `PROJECT_ID` is invalid, revoked, or mismatched in the Raina database. |
| **`5`** | `MQTT_CONNECT_UNAUTHORIZED` | EMQX ACL webhook rejected the connection. Ensure `DEVICE_ID` does not contain illegal characters and that the token has active project permissions. |
| **`-2`** | `MQTT_CONNECT_FAILED` | Network unreachable. Check router routing, IP address of `RAINA_HOST`, or verify port 1883/8883 firewall rules. |
| **`-4`** | `MQTT_CONNECTION_TIMEOUT` | Broker did not return CONNACK within keepalive window. Verify EMQX server is running. |

---

## Unit & Integration Testing

The Raina Arduino SDK includes a dual-tier testing pipeline:

### 1. Native C++ Unit Testing (Local Host Machine)
You can compile and run native tests directly on macOS/Linux using standard `clang++` without needing physical microcontroller hardware:

```bash
# Execute from the monorepo root:
pnpm test:arduino
```

This verifies:
- `RainaValue` type-casting edge cases (`"true"`, `"1"`, `"on"`).
- Inbound JSON envelope and command router dispatching.
- Static registry linking via `RAINA_ON`.
- Variadic multi-metric argument unrolling.
- Auto-flush queuing dynamics.

### 2. Server Integration Testing (Vitest)
Verifies wire protocol compatibility with the Hono.dev backend and PostgreSQL timeseries schemas:

```bash
pnpm --filter @raina/server test
```

---

## License

This software is released under the **MIT License**. You are free to integrate, modify, and distribute this library in commercial and private IoT deployments.
