#ifndef RAINA_H
#define RAINA_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <vector>

#if defined(ESP32)
  #include <WiFi.h>
  #include <WiFiClientSecure.h>
  #include <WiFiMulti.h>
#elif defined(ESP8266)
  #include <ESP8266WiFi.h>
  #include <WiFiClientSecureBearSSL.h>
  #include <ESP8266WiFiMulti.h>
#elif !defined(NATIVE_TEST)
  #include <WiFi.h>
#endif

// ============================================================================
// RAINA COLOR HELPER CLASS
// Represents an RGB color with first-class conversions:
// - Hex string ("#RRGGBB", "RRGGBB", "#RGB")
// - 24-bit integer (0xRRGGBB for NeoPixel / FastLED)
// - 16-bit integer (RGB565 for TFT / LCD displays)
// - HSV conversions
// ============================================================================
struct RainaColor {
  uint8_t r;
  uint8_t g;
  uint8_t b;

  RainaColor() : r(0), g(0), b(0) {}
  RainaColor(uint8_t red, uint8_t green, uint8_t blue) : r(red), g(green), b(blue) {}

  // 24-bit packed RGB (0xRRGGBB) - ideal for WS2812B, NeoPixel, FastLED
  uint32_t toRgb24() const {
    return ((uint32_t)r << 16) | ((uint32_t)g << 8) | (uint32_t)b;
  }

  // 16-bit RGB565 (5-6-5) - ideal for ST7789, ILI9341, TFT_eSPI
  uint16_t toRgb565() const {
    return ((uint16_t)(r & 0xF8) << 8) | ((uint16_t)(g & 0xFC) << 3) | (uint16_t)(b >> 3);
  }

  // Standard Hex format: "#RRGGBB"
  String toHex() const {
    char buf[10];
    snprintf(buf, sizeof(buf), "#%02X%02X%02X", r, g, b);
    return String(buf);
  }

  bool operator==(const RainaColor& o) const { return r == o.r && g == o.g && b == o.b; }
  bool operator!=(const RainaColor& o) const { return !(*this == o); }

  // Factory methods
  static RainaColor fromRgb(uint8_t r, uint8_t g, uint8_t b) { return RainaColor(r, g, b); }
  static RainaColor fromRgb24(uint32_t rgb24) {
    return RainaColor((rgb24 >> 16) & 0xFF, (rgb24 >> 8) & 0xFF, rgb24 & 0xFF);
  }
  static RainaColor fromHex(const char* hex);
  static RainaColor fromHex(const String& hex) { return fromHex(hex.c_str()); }
  static RainaColor fromHsv(float h, float s, float v);
};

// ============================================================================
// RAINA VALUE HELPER CLASS
// Allows intuitive typed access to incoming actuator payloads:
// e.g. value.asBool(), value.asInt(), value.asFloat(), value.asString(), value.asColor()
// ============================================================================
class RainaValue {
 public:
  explicit RainaValue(JsonVariantConst v) : _v(v) {}

  bool asBool() const {
    if (_v.is<bool>()) return _v.as<bool>();
    if (_v.is<const char*>()) {
      String s = _v.as<const char*>();
      s.trim();
      s.toLowerCase();
      return s == "on" || s == "1" || s == "true" || s == "yes";
    }
    return _v.as<double>() != 0.0;
  }

  int asInt() const {
    if (_v.is<const char*>()) return atoi(_v.as<const char*>());
    return _v.as<int>();
  }

  long asLong() const {
    if (_v.is<const char*>()) return atol(_v.as<const char*>());
    return _v.as<long>();
  }

  float asFloat() const {
    if (_v.is<const char*>()) return atof(_v.as<const char*>());
    return _v.as<float>();
  }

  double asDouble() const {
    if (_v.is<const char*>()) return atof(_v.as<const char*>());
    return _v.as<double>();
  }

  String asString() const {
    if (_v.isNull()) return String();
    if (_v.is<const char*>()) return String(_v.as<const char*>());
    String s;
    serializeJson(_v, s);
    return s;
  }

  RainaColor asColor() const;
  RainaColor asRGB() const { return asColor(); }

  bool isNull() const { return _v.isNull(); }
  JsonVariantConst raw() const { return _v; }

 private:
  JsonVariantConst _v;
};

// ============================================================================
// DECLARATIVE REGISTRATION MACRO (RAINA_ON)
// Example usage:
//   RAINA_ON("pump_relay") {
//     digitalWrite(PUMP_PIN, value.asBool() ? HIGH : LOW);
//     Raina.send("pump_relay", value.asBool());
//   }
// ============================================================================
typedef void (*RainaWriteFn)(RainaValue value);

struct RainaHandlerReg {
  const char* variable;
  RainaWriteFn fn;
  RainaHandlerReg* next;
  RainaHandlerReg(const char* v, RainaWriteFn f);
};

#define RAINA_CONCAT_(a, b) a##b
#define RAINA_CONCAT(a, b) RAINA_CONCAT_(a, b)

#define RAINA_ON_IMPL(var, fn, reg)  \
  static void fn(RainaValue value);    \
  static RainaHandlerReg reg(var, fn); \
  static void fn(RainaValue value)

// Primary Macro: Triggered when dashboard/cloud sends command to this variable
#define RAINA_ON(var)                                       \
  RAINA_ON_IMPL(var, RAINA_CONCAT(raina_fn_, __COUNTER__), \
                     RAINA_CONCAT(raina_reg_, __COUNTER__))

// Aliases for convenience / backwards compatibility
#define RAINA_COMMAND(var) RAINA_ON(var)
#define RAINA_WRITE(var)   RAINA_ON(var)

// ============================================================================
// MAIN RAINA SDK CLIENT CLASS
// ============================================================================
class RainaClass {
 public:
  RainaClass();

  // Register one or more WiFi Access Points
  void addAP(const char* ssid, const char* pass);

  // Initialize with WiFi credentials and raina connection parameters
  void begin(const char* ssid, const char* pass,
             const char* host, const char* projectId,
             const char* token, const char* deviceId,
             uint16_t port = 1883);

  // Initialize if WiFi is already managed externally
  void begin(const char* host, const char* projectId,
             const char* token, const char* deviceId,
             uint16_t port = 1883);

  // Non-blocking loop. Call this in loop() on every iteration.
  // Automatically maintains connections and flushes queued telemetry.
  void run();

  // Telemetry (Single Metric): Queues metric into current cycle.
  // Auto-flushed automatically on loop() by Raina.run() (no .flush() required!)
  void send(const char* variable, bool value);
  void send(const char* variable, int value);
  void send(const char* variable, long value);
  void send(const char* variable, float value);
  void send(const char* variable, double value);
  void send(const char* variable, const char* value);
  void send(const char* variable, const String& value);
  void send(const char* variable, const RainaColor& color);

  void send(const String& variable, bool value) { send(variable.c_str(), value); }
  void send(const String& variable, int value) { send(variable.c_str(), value); }
  void send(const String& variable, long value) { send(variable.c_str(), value); }
  void send(const String& variable, float value) { send(variable.c_str(), value); }
  void send(const String& variable, double value) { send(variable.c_str(), value); }
  void send(const String& variable, const char* value) { send(variable.c_str(), value); }
  void send(const String& variable, const String& value) { send(variable.c_str(), value.c_str()); }
  void send(const String& variable, const RainaColor& color) { send(variable.c_str(), color); }

  // Convenience Color Telemetry
  void sendColor(const char* variable, uint8_t r, uint8_t g, uint8_t b);
  void sendColor(const String& variable, uint8_t r, uint8_t g, uint8_t b) {
    sendColor(variable.c_str(), r, g, b);
  }
  void sendColor(const char* variable, const RainaColor& color) {
    send(variable, color);
  }
  void sendColor(const String& variable, const RainaColor& color) {
    send(variable.c_str(), color);
  }

  // Telemetry (Multi-Metric One-Liner): Send 2 or more key-value pairs in one shot!
  // Example: Raina.send("temp", 28.5, "humidity", 65.0, "soil", 58.0);
  // Transmits immediately in a single MQTT packet.
  template <typename K1, typename V1, typename K2, typename V2, typename... Rest>
  bool send(K1 k1, V1 v1, K2 k2, V2 v2, Rest... rest) {
    send(k1, v1);
    send(k2, v2);
    _packRest(rest...);
    return flush();
  }

  // Immediately send a single metric
  template <typename T>
  bool sendNow(const char* variable, T value) {
    send(variable, value);
    return flush();
  }

  // Optional manual flush (normally handled automatically by Raina.run())
  bool flush();

  // Auto-flush configuration (defaults to true)
  void setAutoFlush(bool enable) { _autoFlush = enable; }

  // Imperative runtime handler registration (alternative to RAINA_WRITE)
  void onWrite(const char* variable, RainaWriteFn callback);

  // Connection lifecycle callbacks
  void onConnect(void (*cb)()) { _onConnect = cb; }
  void onDisconnect(void (*cb)()) { _onDisconnect = cb; }

  // State queries
  bool connected() const { return _connected; }
  const String& deviceId() const { return _deviceId; }
  const String& projectId() const { return _projectId; }

  // Configuration options
  void setDebug(bool on = true) { _debug = on; }
  void setReconnectInterval(unsigned long ms) { _reconnectInterval = ms; }
  void setAutoFlushInterval(unsigned long ms) { _autoFlushInterval = ms; }
  void setBufferSize(uint16_t size);

  // TLS Security Settings
  void setSecure(bool secure = true);
  void setCACert(const char* pem);
  void setFingerprint(const char* fp);
  void setInsecure();

  // Low-level MQTT Access
  PubSubClient& getMqttClient() { return _mqtt; }
  void handleMqttMessage(char* topic, byte* payload, unsigned int length);

 private:
  void connectWiFiBlocking(uint32_t timeoutMs = 12000);
  void maintainWiFi();
  void maintainMqtt();
  bool connectMqtt();
  void dispatchControl(const char* variable, JsonVariantConst value);
  bool validKey(const char* key) const;

  // WiFi & Network Clients
  #if defined(ESP32)
    WiFiMulti _wifiMulti;
    WiFiClientSecure _wifiClientSecure;
  #elif defined(ESP8266)
    ESP8266WiFiMulti _wifiMulti;
    BearSSL::WiFiClientSecure _wifiClientSecure;
  #endif
  WiFiClient _wifiClient;
  PubSubClient _mqtt;

  // Configuration State
  String _host;
  uint16_t _port = 1883;
  String _projectId;
  String _token;
  String _deviceId;
  bool _hasAP = false;
  bool _useTls = false;
  bool _insecure = true;
  const char* _caCert = nullptr;
  const char* _fingerprint = nullptr;
  bool _debug = false;

  // Runtime State
  bool _connected = false;
  bool _autoFlush = true;
  unsigned long _lastWiFiAttempt = 0;
  unsigned long _lastMqttAttempt = 0;
  unsigned long _reconnectInterval = 3000;
  unsigned long _autoFlushInterval = 0;
  unsigned long _lastFlushTime = 0;

  // Telemetry buffer
  #if ARDUINOJSON_VERSION_MAJOR >= 7
    JsonDocument _txDoc;
  #else
    DynamicJsonDocument _txDoc;
  #endif

  // Dynamic handlers
  struct DynamicHandler {
    String variable;
    RainaWriteFn fn;
  };
  std::vector<DynamicHandler> _dynamicHandlers;

  // Callbacks
  void (*_onConnect)() = nullptr;
  void (*_onDisconnect)() = nullptr;

  // Static message router for PubSubClient callback
  static void _staticMqttCallback(char* topic, byte* payload, unsigned int length);

  // Variadic template unrolling helpers
  void _packRest() {}
  template <typename K, typename V, typename... Rest>
  void _packRest(K k, V v, Rest... rest) {
    send(k, v);
    _packRest(rest...);
  }
};

extern RainaClass Raina;

#endif // RAINA_H
