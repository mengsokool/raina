# Raina Arduino SDK

Raina SDK v2 connects ESP32 and ESP8266 devices to Raina using **RLP v1**: one authenticated binary socket for telemetry, dashboard commands, acknowledgements, and heartbeats. MQTT and EMQX are not required.

The application-facing API is unchanged: call `Raina.run()` in `loop()`, publish measurements with `Raina.send()`, and receive controls with `RAINA_ON()`.

## Install

PlatformIO:

```ini
lib_deps =
  https://github.com/mengsokool/raina.git#main:sdks/arduino
```

Arduino IDE: add this `sdks/arduino` directory as a ZIP library. Zero external dependencies required (no ArduinoJson, no MQTT library).

## Quick start

```cpp
#include <Raina.h>

const char* WIFI_SSID = "Farm WiFi";
const char* WIFI_PASS = "password";
const char* RAINA_HOST = "raina-service.sokool.store";
const char* PROJECT_ID = "proj_farm_01"; // retained for source compatibility
const char* PROJECT_TOKEN = "your-hardware-token";
const char* DEVICE_ID = "greenhouse-01";

RAINA_ON("pump_relay") {
  digitalWrite(18, value.asBool() ? HIGH : LOW);
  Raina.send("pump_relay", value.asBool()); // report the actual physical state
}

void setup() {
  pinMode(18, OUTPUT);

  // Production uses RLP over TLS on port 8883. Supply your CA certificate
  // before connection; do not use setInsecure() outside a trusted dev network.
  Raina.setCACert(R"PEM(-----BEGIN CERTIFICATE-----
... your CA certificate ...
-----END CERTIFICATE-----)PEM");
  Raina.begin(WIFI_SSID, WIFI_PASS, RAINA_HOST, PROJECT_ID,
              PROJECT_TOKEN, DEVICE_ID, 8883);
}

void loop() {
  Raina.run();

  static unsigned long lastReading = 0;
  if (millis() - lastReading >= 5000) {
    lastReading = millis();
    Raina.send("temperature", 28.5);
    Raina.send("humidity", 65.2);
  }
}
```

For local development, use the RLP gateway's plain TCP listener (`9000`) and pass that port to `begin()`. Production must use TLS (`8883`) and certificate verification. `setInsecure()` is an explicit development escape hatch only.

## Variable channels

RLP uses numeric channels on the wire. The SDK derives a stable channel from every variable key and advertises the key-to-channel mapping in the authenticated HELLO frame. The server stores that mapping per device, so dashboard controls are routed back to the correct `RAINA_ON` handler.

Set a channel only when migrating a device that needs a fixed value:

```cpp
Raina.setChannel("pump_relay", 7); // call before begin()
```

Use keys containing only letters, numbers, `_`, `-`, and `.`; keys are capped at 64 characters.

## Behaviour and safety

- `begin()` is configuration only; `run()` owns connection attempts and frame processing.
- A `WELCOME` handshake completes authentication before the SDK sends telemetry.
- Commands carry an ID. The SDK acknowledges them and suppresses duplicate execution.
- Telemetry is batched automatically. Values staged while offline remain queued.
- The parser rejects oversized frames before decoding them; `setBufferSize()` controls the accepted frame size (minimum 128 bytes, default 1024).
- A project hardware token authenticates the connection. It is never written to SDK logs.
- `PROJECT_ID` remains in `begin()` for firmware compatibility but RLP authorizes using `PROJECT_TOKEN`; do not treat the project ID as a credential.

## API notes

```cpp
void Raina.begin(ssid, password, host, projectId, token, deviceId, port = 8883);
void Raina.run();
void Raina.send("key", value);
bool Raina.flush();
void Raina.onWrite("key", callback);
void Raina.setChannel("key", channel);
void Raina.setCACert(pem);       // ESP32 TLS verification
void Raina.setFingerprint(value); // ESP8266 TLS verification
void Raina.setInsecure();        // development only
```

Call `setCACert` / `setFingerprint` before `begin`. On ESP32 and ESP8266, a TLS connection fails closed if verification is not configured. Use `onConnect` and `onDisconnect` for application status LEDs or local fallbacks.

## Test

```sh
pnpm --dir sdks/arduino test
```

The native test checks HELLO capabilities, `WELCOME`, batched telemetry, command dispatch/ACK, and parser frame limits.
