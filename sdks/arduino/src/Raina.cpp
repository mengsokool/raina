#include "Raina.h"

#define RAINA_LOG(...) do { if (_debug) Serial.printf(__VA_ARGS__); } while (0)

static const int MAX_KEY_LEN = 64;

// ----------------------------------------------------------------------------
// Handler Registry Head (Function-local static ensures validity during init)
// ----------------------------------------------------------------------------
static RainaHandlerReg*& registryHead() {
  static RainaHandlerReg* head = nullptr;
  return head;
}

RainaHandlerReg::RainaHandlerReg(const char* v, RainaWriteFn f)
    : variable(v), fn(f), next(nullptr) {
  RainaHandlerReg*& head = registryHead();
  next = head;
  head = this;
}

// ----------------------------------------------------------------------------
// Global Instance
// ----------------------------------------------------------------------------
RainaClass Raina;

void RainaClass::_staticMqttCallback(char* topic, byte* payload, unsigned int length) {
  Raina.handleMqttMessage(topic, payload, length);
}

// ----------------------------------------------------------------------------
// Constructor & Setup
// ----------------------------------------------------------------------------
#if ARDUINOJSON_VERSION_MAJOR >= 7
RainaClass::RainaClass() : _mqtt(_wifiClient) {
  _mqtt.setBufferSize(1024);
  _mqtt.setCallback(_staticMqttCallback);
}
#else
RainaClass::RainaClass() : _mqtt(_wifiClient), _txDoc(1024) {
  _mqtt.setBufferSize(1024);
  _mqtt.setCallback(_staticMqttCallback);
}
#endif

void RainaClass::setBufferSize(uint16_t size) {
  _mqtt.setBufferSize(size);
}

void RainaClass::addAP(const char* ssid, const char* pass) {
#if defined(ESP32) || defined(ESP8266)
  _wifiMulti.addAP(ssid, pass);
  _hasAP = true;
#else
  WiFi.begin(ssid, pass);
  _hasAP = true;
#endif
}

void RainaClass::setSecure(bool secure) {
  _useTls = secure;
}

void RainaClass::setCACert(const char* pem) {
  _caCert = pem;
  _useTls = true;
  _insecure = false;
}

void RainaClass::setFingerprint(const char* fp) {
  _fingerprint = fp;
  _useTls = true;
  _insecure = false;
}

void RainaClass::setInsecure() {
  _useTls = true;
  _insecure = true;
  _caCert = nullptr;
  _fingerprint = nullptr;
}

void RainaClass::begin(const char* ssid, const char* pass,
                       const char* host, const char* projectId,
                       const char* token, const char* deviceId,
                       uint16_t port) {
  addAP(ssid, pass);
  begin(host, projectId, token, deviceId, port);
}

void RainaClass::begin(const char* host, const char* projectId,
                       const char* token, const char* deviceId,
                       uint16_t port) {
  _host = host;
  _projectId = projectId;
  _token = token;
  _deviceId = deviceId;
  _port = port;
  _recentCommandCursor = 0;
  for (uint8_t i = 0; i < RECENT_COMMAND_CACHE_SIZE; ++i) {
    _recentCommandIds[i] = String();
  }

  if (_port == 8883) {
    _useTls = true;
  }

  // Configure Transport Client
  if (_useTls) {
#if defined(ESP32)
    if (_caCert) {
      _wifiClientSecure.setCACert(_caCert);
    } else if (_insecure) {
      _wifiClientSecure.setInsecure();
    }
    _mqtt.setClient(_wifiClientSecure);
#elif defined(ESP8266)
    if (_fingerprint) {
      _wifiClientSecure.setFingerprint(_fingerprint);
    } else if (_insecure) {
      _wifiClientSecure.setInsecure();
    }
    _mqtt.setClient(_wifiClientSecure);
#endif
  } else {
    _mqtt.setClient(_wifiClient);
  }

  _mqtt.setServer(_host.c_str(), _port);
  _mqtt.setCallback(_staticMqttCallback);
  _mqtt.setKeepAlive(30);

  RAINA_LOG("\n[raina] Initializing raina IoT client...\n");
  RAINA_LOG("[raina] Host: %s:%d | Project: %s | Device: %s\n",
            _host.c_str(), _port, _projectId.c_str(), _deviceId.c_str());

  // Connection work starts from run(), keeping setup() responsive.
  _lastWiFiAttempt = millis() - 4000;
}

// ----------------------------------------------------------------------------
// Connection Management (Non-blocking & Self-healing)
// ----------------------------------------------------------------------------
void RainaClass::maintainWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  unsigned long now = millis();
  if (now - _lastWiFiAttempt < 4000) return;
  _lastWiFiAttempt = now;

  if (_hasAP) {
    RAINA_LOG("[raina] WiFi link down. Retrying...\n");
#if defined(ESP32) || defined(ESP8266)
    _wifiMulti.run();
#else
    WiFi.reconnect();
#endif
  }
}

bool RainaClass::connectMqtt() {
  if (WiFi.status() != WL_CONNECTED) return false;

  if (_useTls && !_insecure) {
#if defined(ESP32)
    if (!_caCert) {
      RAINA_LOG("[raina] TLS requires a CA certificate. Call setCACert(), or explicitly setInsecure() for development.\n");
      return false;
    }
#elif defined(ESP8266)
    if (!_fingerprint) {
      RAINA_LOG("[raina] TLS requires a certificate fingerprint. Call setFingerprint(), or explicitly setInsecure() for development.\n");
      return false;
    }
#else
    RAINA_LOG("[raina] TLS is unsupported on this target without a secure client.\n");
    return false;
#endif
  }

  // Last Will and Testament (LWT) configuration
  String statusTopic = "projects/" + _projectId + "/devices/" + _deviceId + "/status";
  const char* willPayload = "{\"status\":\"offline\"}";

  RAINA_LOG("[raina] Connecting to MQTT Broker with ClientID: %s...\n", _deviceId.c_str());

  bool ok = _mqtt.connect(
      _deviceId.c_str(),
      _projectId.c_str(),
      _token.c_str(),
      statusTopic.c_str(),
      1,
      false,
      willPayload);

  if (ok) {
    _connected = true;
    RAINA_LOG("[raina] Connected to raina EMQX Broker!\n");

    // 1. Publish online status
    _mqtt.publish(statusTopic.c_str(), "{\"status\":\"online\"}", false);

    // 2. Subscribe to downlink actuator topics
    String cmdTopic1 = "v1/" + _projectId + "/devices/" + _deviceId + "/commands";
    String cmdTopic2 = "projects/" + _projectId + "/devices/" + _deviceId + "/control";
    _mqtt.subscribe(cmdTopic1.c_str(), 1);
    _mqtt.subscribe(cmdTopic2.c_str(), 1);

    RAINA_LOG("[raina] Subscribed to downlink commands:\n");
    RAINA_LOG("   -> %s\n", cmdTopic1.c_str());
    RAINA_LOG("   -> %s\n", cmdTopic2.c_str());

    // Flush any telemetry staged while offline
    flush();

    if (_onConnect) _onConnect();
  } else {
    _connected = false;
    int state = _mqtt.state();
    RAINA_LOG("[raina] MQTT connect failed (state %d): ", state);
    switch (state) {
      case -4: RAINA_LOG("Connection timeout\n"); break;
      case -2: RAINA_LOG("Network failed (broker unreachable)\n"); break;
      case 4:  RAINA_LOG("Bad credentials! Check PROJECT_ID and TOKEN.\n"); break;
      case 5:  RAINA_LOG("Unauthorized! EMQX ACL or Token revoked.\n"); break;
      default: RAINA_LOG("Error code %d\n", state); break;
    }
  }

  return ok;
}

void RainaClass::maintainMqtt() {
  if (WiFi.status() != WL_CONNECTED) {
    if (_connected) {
      _connected = false;
      if (_onDisconnect) _onDisconnect();
    }
    return;
  }

  if (_mqtt.connected()) {
    if (!_connected) {
      _connected = true;
    }
    return;
  }

  if (_connected) {
    _connected = false;
    RAINA_LOG("[raina] MQTT connection lost.\n");
    if (_onDisconnect) _onDisconnect();
  }

  unsigned long now = millis();
  if (_lastMqttAttempt > 0 && (now - _lastMqttAttempt < _reconnectInterval)) return;
  _lastMqttAttempt = now;

  connectMqtt();
}

void RainaClass::run() {
  maintainWiFi();
  maintainMqtt();

  if (_mqtt.connected()) {
    _mqtt.loop();

    // Auto-flush queued telemetry immediately (no manual .flush() required!)
    if (_autoFlush && _txDoc.size() > 0) {
      flush();
    }
  }

  // Handle scheduled auto-flush if interval is configured
  if (_autoFlushInterval > 0 && (millis() - _lastFlushTime >= _autoFlushInterval)) {
    flush();
  }
}

// ----------------------------------------------------------------------------
// Inbound Command Dispatching
// ----------------------------------------------------------------------------
bool RainaClass::isDuplicateCommand(const char* commandId) {
  if (!commandId || !*commandId) return false;

  for (uint8_t i = 0; i < RECENT_COMMAND_CACHE_SIZE; ++i) {
    if (_recentCommandIds[i] == commandId) return true;
  }

  _recentCommandIds[_recentCommandCursor] = commandId;
  _recentCommandCursor = (_recentCommandCursor + 1) % RECENT_COMMAND_CACHE_SIZE;
  return false;
}

void RainaClass::handleMqttMessage(char* topic, byte* payload, unsigned int length) {
#if ARDUINOJSON_VERSION_MAJOR >= 7
  JsonDocument doc;
#else
  DynamicJsonDocument doc(1024);
#endif

  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) {
    RAINA_LOG("[raina] JSON parse error on topic %s: %s\n", topic, err.c_str());
    return;
  }

  const char* commandId = doc["cmd_id"].is<const char*>()
      ? doc["cmd_id"].as<const char*>()
      : nullptr;
  if (isDuplicateCommand(commandId)) {
    RAINA_LOG("[raina] Ignoring duplicate command: %s\n", commandId);
    return;
  }

  // Format A: { "variable": "relay", "value": 1 } or { "key": "relay", "value": 1 }
  if (doc["variable"].is<const char*>() && !doc["value"].isNull()) {
    dispatchControl(doc["variable"].as<const char*>(), doc["value"]);
    return;
  }
  if (doc["key"].is<const char*>() && !doc["value"].isNull()) {
    dispatchControl(doc["key"].as<const char*>(), doc["value"]);
    return;
  }

  // Format B: Direct dictionary { "pump_relay": 1, "cmd_id": "...", "ts": ... }
  if (doc.is<JsonObject>()) {
    for (JsonPair kv : doc.as<JsonObject>()) {
      const char* key = kv.key().c_str();
      // Skip envelope metadata
      if (strcmp(key, "cmd_id") == 0 || strcmp(key, "ts") == 0 || strcmp(key, "timestamp") == 0) {
        continue;
      }
      dispatchControl(key, kv.value());
    }
  }
}

void RainaClass::dispatchControl(const char* variable, JsonVariantConst value) {
  bool handled = false;

  // 1. Check declarative static handlers (registered via RAINA_WRITE macro)
  for (RainaHandlerReg* r = registryHead(); r; r = r->next) {
    if (strcmp(r->variable, variable) == 0 && r->fn) {
      r->fn(RainaValue(value));
      handled = true;
    }
  }

  // 2. Check imperative runtime handlers (registered via Raina.onWrite)
  for (const auto& h : _dynamicHandlers) {
    if (h.variable == variable && h.fn) {
      h.fn(RainaValue(value));
      handled = true;
    }
  }

  if (handled) {
    RAINA_LOG("[raina] Command executed for variable: '%s'\n", variable);
  } else {
    RAINA_LOG("[raina] Unhandled command received for variable: '%s'\n", variable);
  }
}

void RainaClass::onWrite(const char* variable, RainaWriteFn callback) {
  _dynamicHandlers.push_back({String(variable), callback});
}

// ----------------------------------------------------------------------------
// Outbound Telemetry Publishing
// ----------------------------------------------------------------------------
bool RainaClass::validKey(const char* key) const {
  if (!key) return false;
  size_t n = strlen(key);
  if (n < 1 || n > (size_t)MAX_KEY_LEN) {
    RAINA_LOG("[raina] Key dropped (invalid length): %s\n", key);
    return false;
  }
  return true;
}

void RainaClass::send(const char* variable, bool value) {
  if (!validKey(variable)) return;
  _txDoc[variable] = value;
}

void RainaClass::send(const char* variable, int value) {
  if (!validKey(variable)) return;
  _txDoc[variable] = value;
}

void RainaClass::send(const char* variable, long value) {
  if (!validKey(variable)) return;
  _txDoc[variable] = value;
}

void RainaClass::send(const char* variable, float value) {
  if (!validKey(variable)) return;
  _txDoc[variable] = value;
}

void RainaClass::send(const char* variable, double value) {
  if (!validKey(variable)) return;
  _txDoc[variable] = value;
}

void RainaClass::send(const char* variable, const char* value) {
  if (!validKey(variable)) return;
  _txDoc[variable] = value;
}

void RainaClass::send(const char* variable, const String& value) {
  send(variable, value.c_str());
}

bool RainaClass::flush() {
  if (_txDoc.size() == 0) return true;
  if (!_connected || !_mqtt.connected()) {
    // Keep staged in buffer until reconnected
    return false;
  }

  String topic = "v1/" + _projectId + "/devices/" + _deviceId + "/telemetry";
  String payload;
  serializeJson(_txDoc, payload);

  bool ok = _mqtt.publish(topic.c_str(), payload.c_str(), false);
  if (ok) {
    RAINA_LOG("[raina] Telemetry published -> %s\n", payload.c_str());
    _txDoc.clear();
    _lastFlushTime = millis();
  } else {
    RAINA_LOG("[raina] Telemetry publish failed to %s\n", topic.c_str());
  }

  return ok;
}

// ----------------------------------------------------------------------------
// RainaColor Implementation & Helpers
// ----------------------------------------------------------------------------
static inline uint8_t parseHexNibble(char c) {
  if (c >= '0' && c <= '9') return (uint8_t)(c - '0');
  if (c >= 'a' && c <= 'f') return (uint8_t)(c - 'a' + 10);
  if (c >= 'A' && c <= 'F') return (uint8_t)(c - 'A' + 10);
  return 0;
}

RainaColor RainaColor::fromHex(const char* hex) {
  if (!hex) return RainaColor(0, 0, 0);
  while (*hex == ' ' || *hex == '\t' || *hex == '\r' || *hex == '\n') hex++;
  if (*hex == '#') hex++;
  size_t len = strlen(hex);
  if (len >= 6) {
    uint8_t r = (parseHexNibble(hex[0]) << 4) | parseHexNibble(hex[1]);
    uint8_t g = (parseHexNibble(hex[2]) << 4) | parseHexNibble(hex[3]);
    uint8_t b = (parseHexNibble(hex[4]) << 4) | parseHexNibble(hex[5]);
    return RainaColor(r, g, b);
  } else if (len >= 3) {
    uint8_t r = (parseHexNibble(hex[0]) << 4) | parseHexNibble(hex[0]);
    uint8_t g = (parseHexNibble(hex[1]) << 4) | parseHexNibble(hex[1]);
    uint8_t b = (parseHexNibble(hex[2]) << 4) | parseHexNibble(hex[2]);
    return RainaColor(r, g, b);
  }
  return RainaColor(0, 0, 0);
}

RainaColor RainaColor::fromHsv(float h, float s, float v) {
  if (s > 1.0f) s /= 100.0f;
  if (v > 1.0f) v /= 100.0f;
  if (s < 0.0f) s = 0.0f; else if (s > 1.0f) s = 1.0f;
  if (v < 0.0f) v = 0.0f; else if (v > 1.0f) v = 1.0f;

  while (h < 0.0f) h += 360.0f;
  while (h >= 360.0f) h -= 360.0f;

  float c = v * s;
  float x = c * (1.0f - fabsf(fmodf(h / 60.0f, 2.0f) - 1.0f));
  float m = v - c;

  float r1 = 0, g1 = 0, b1 = 0;
  if (h < 60.0f) { r1 = c; g1 = x; b1 = 0; }
  else if (h < 120.0f) { r1 = x; g1 = c; b1 = 0; }
  else if (h < 180.0f) { r1 = 0; g1 = c; b1 = x; }
  else if (h < 240.0f) { r1 = 0; g1 = x; b1 = c; }
  else if (h < 300.0f) { r1 = x; g1 = 0; b1 = c; }
  else { r1 = c; g1 = 0; b1 = x; }

  uint8_t r = (uint8_t)roundf((r1 + m) * 255.0f);
  uint8_t g = (uint8_t)roundf((g1 + m) * 255.0f);
  uint8_t b = (uint8_t)roundf((b1 + m) * 255.0f);
  return RainaColor(r, g, b);
}

RainaColor RainaValue::asColor() const {
  if (_v.isNull()) return RainaColor(0, 0, 0);

  // 1. String hex representation: "#RRGGBB", "RRGGBB", "#RGB"
  if (_v.is<const char*>()) {
    return RainaColor::fromHex(_v.as<const char*>());
  }

  // 2. Object with { r, g, b } or { h, s, v }
  if (!_v["r"].isNull() || !_v["g"].isNull() || !_v["b"].isNull()) {
    uint8_t r = _v["r"].isNull() ? 0 : (uint8_t)_v["r"].as<int>();
    uint8_t g = _v["g"].isNull() ? 0 : (uint8_t)_v["g"].as<int>();
    uint8_t b = _v["b"].isNull() ? 0 : (uint8_t)_v["b"].as<int>();
    return RainaColor(r, g, b);
  }

  if (!_v["h"].isNull() || !_v["s"].isNull() || !_v["v"].isNull()) {
    float h = _v["h"].isNull() ? 0.0f : _v["h"].as<float>();
    float s = _v["s"].isNull() ? 0.0f : _v["s"].as<float>();
    float v = _v["v"].isNull() ? 0.0f : _v["v"].as<float>();
    return RainaColor::fromHsv(h, s, v);
  }

  // 3. Packed numeric 24-bit RGB integer (e.g. 0xFF00FF)
  if (_v.is<int>() || _v.is<long>() || _v.is<double>()) {
    return RainaColor::fromRgb24((uint32_t)_v.as<long>());
  }

  return RainaColor(0, 0, 0);
}

void RainaClass::send(const char* variable, const RainaColor& color) {
  send(variable, color.toHex());
}

void RainaClass::sendColor(const char* variable, uint8_t r, uint8_t g, uint8_t b) {
  send(variable, RainaColor(r, g, b));
}
