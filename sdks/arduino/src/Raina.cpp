#include "Raina.h"

#define RAINA_LOG(...) do { if (_debug) Serial.printf(__VA_ARGS__); } while (0)

static const int MAX_KEY_LEN = 64;
static const uint8_t RLP_VERSION = 1;
static const uint8_t RLP_HELLO = 1;
static const uint8_t RLP_WELCOME = 2;
static const uint8_t RLP_DATA = 3;
static const uint8_t RLP_BATCH = 4;
static const uint8_t RLP_COMMAND = 5;
static const uint8_t RLP_ACK = 6;
static const uint8_t RLP_PING = 7;
static const uint8_t RLP_PONG = 8;
static const uint8_t RLP_ERROR = 9;
static const uint8_t RLP_DISCONNECT = 10;

static const uint8_t RLP_BOOL = 1;
static const uint8_t RLP_INT8 = 2;
static const uint8_t RLP_UINT8 = 3;
static const uint8_t RLP_INT16 = 4;
static const uint8_t RLP_UINT16 = 5;
static const uint8_t RLP_INT32 = 6;
static const uint8_t RLP_UINT32 = 7;
static const uint8_t RLP_FLOAT32 = 10;
static const uint8_t RLP_FLOAT64 = 11;
static const uint8_t RLP_STRING = 12;

static void appendU16(std::vector<uint8_t>& out, uint16_t value) {
  out.push_back((uint8_t)(value >> 8));
  out.push_back((uint8_t)value);
}

static void appendU32(std::vector<uint8_t>& out, uint32_t value) {
  out.push_back((uint8_t)(value >> 24));
  out.push_back((uint8_t)(value >> 16));
  out.push_back((uint8_t)(value >> 8));
  out.push_back((uint8_t)value);
}

static void appendFloat64(std::vector<uint8_t>& out, double value) {
  uint64_t bits = 0;
  memcpy(&bits, &value, sizeof(bits));
  for (int i = 7; i >= 0; --i) out.push_back((uint8_t)(bits >> (i * 8)));
}

static uint16_t readU16(const uint8_t* value) {
  return ((uint16_t)value[0] << 8) | value[1];
}

static uint32_t readU32(const uint8_t* value) {
  return ((uint32_t)value[0] << 24) | ((uint32_t)value[1] << 16) |
         ((uint32_t)value[2] << 8) | value[3];
}

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

// ----------------------------------------------------------------------------
// Constructor & Setup
// ----------------------------------------------------------------------------
RainaClass::RainaClass() {}

void RainaClass::setBufferSize(uint16_t size) {
  _maxFrameSize = size < 128 ? 128 : size;
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
}

void RainaClass::setFingerprint(const char* fp) {
  _fingerprint = fp;
  _useTls = true;
}

void RainaClass::setInsecure() {
  _insecure = true;
  _useTls = true;
}

void RainaClass::setChannel(const char* variable, uint16_t channel) {
  if (!validKey(variable) || channel == 0) return;
  for (auto& binding : _channels) {
    if (binding.variable == variable) {
      if (binding.channel != channel) {
        binding.channel = channel;
        _needsHandshake = true;
      }
      return;
    }
  }
  _channels.push_back({String(variable), channel});
  _needsHandshake = true;
}

void RainaClass::configureTransport() {
  if (_useTls) {
#if defined(ESP32)
    if (_insecure) _wifiClientSecure.setInsecure();
    else if (_caCert) _wifiClientSecure.setCACert(_caCert);
    _transport = &_wifiClientSecure;
#elif defined(ESP8266)
    if (_insecure) _wifiClientSecure.setInsecure();
    else if (_fingerprint) _wifiClientSecure.setFingerprint(_fingerprint);
    _transport = &_wifiClientSecure;
#else
    _transport = &_wifiClient;
#endif
  } else {
    _transport = &_wifiClient;
  }
}

void RainaClass::begin(const char* host, const char* projectId,
                       const char* token, const char* deviceId,
                       uint16_t port) {
  _host = host ? host : "";
  _port = port;
  _projectId = projectId ? projectId : "";
  _token = token ? token : "";
  _deviceId = deviceId ? deviceId : "";
  configureTransport();
}

void RainaClass::begin(const char* ssid, const char* pass,
                       const char* host, const char* projectId,
                       const char* token, const char* deviceId,
                       uint16_t port) {
  addAP(ssid, pass);
  begin(host, projectId, token, deviceId, port);
}

void RainaClass::maintainWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  if (_connected && _onDisconnect) _onDisconnect();
  _connected = false;
  _awaitingWelcome = false;
  if (_transport) _transport->stop();
  unsigned long now = millis();
  if (_lastWiFiAttempt && now - _lastWiFiAttempt < 1000) return;
  _lastWiFiAttempt = now;
#if defined(ESP32) || defined(ESP8266)
  if (_hasAP) { _wifiMulti.run(); return; }
#endif
  WiFi.reconnect();
}

bool RainaClass::sendRlpFrame(uint8_t type, const uint8_t* payload, size_t length) {
  if (!_transport || !_transport->connected() || length > _maxFrameSize || length > 0xFFFF) return false;
  uint8_t header[4] = {type, 0, (uint8_t)(length >> 8), (uint8_t)length};
  if (_transport->write(header, sizeof(header)) != sizeof(header)) return false;
  return length == 0 || _transport->write(payload, length) == length;
}

uint16_t RainaClass::channelFor(const char* variable) const {
  if (!variable) return 0;
  for (const auto& binding : _channels) {
    if (binding.variable == variable) return binding.channel;
  }
  return 0;
}

bool RainaClass::ensureChannel(const char* variable) {
  if (!validKey(variable) || channelFor(variable)) return channelFor(variable) != 0;
  uint32_t hash = 2166136261UL;
  for (const char* p = variable; *p; ++p) hash = (hash ^ (uint8_t)*p) * 16777619UL;
  uint16_t channel = (uint16_t)(hash ^ (hash >> 16));
  if (channel == 0) channel = 1;
  while (true) {
    bool collision = false;
    for (const auto& binding : _channels) {
      if (binding.channel == channel) {
        collision = true;
        channel = channel == 0xFFFF ? 1 : channel + 1;
        break;
      }
    }
    if (!collision) break;
  }
  _channels.push_back({String(variable), channel});
  _needsHandshake = true;
  return true;
}

bool RainaClass::sendHello() {
  String capabilities = "{\"raina\":{\"channels\":{";
  bool first = true;
  for (const auto& binding : _channels) {
    if (!first) capabilities += ",";
    first = false;
    capabilities += "\"" + binding.variable + "\":" + String(binding.channel);
  }
  capabilities += "}}}";
  if (_deviceId.length() == 0 || _deviceId.length() > 255 || _token.length() == 0 ||
      _token.length() > 1024 || capabilities.length() > 2048) return false;
  std::vector<uint8_t> payload;
  payload.push_back(RLP_VERSION);
  payload.push_back((uint8_t)_deviceId.length());
  payload.insert(payload.end(), _deviceId.c_str(), _deviceId.c_str() + _deviceId.length());
  appendU16(payload, (uint16_t)_token.length());
  payload.insert(payload.end(), _token.c_str(), _token.c_str() + _token.length());
  appendU16(payload, (uint16_t)capabilities.length());
  payload.insert(payload.end(), capabilities.c_str(), capabilities.c_str() + capabilities.length());
  return sendRlpFrame(RLP_HELLO, payload.data(), payload.size());
}

bool RainaClass::sendPing() {
  uint8_t nonce[4] = {0, 0, 0, 0};
  return sendRlpFrame(RLP_PING, nonce, sizeof(nonce));
}

bool RainaClass::connectRlp() {
  if (WiFi.status() != WL_CONNECTED) return false;
  for (RainaHandlerReg* r = registryHead(); r; r = r->next) ensureChannel(r->variable);
  for (const auto& handler : _dynamicHandlers) ensureChannel(handler.variable.c_str());
  if (_useTls && !_insecure) {
#if defined(ESP32)
    if (!_caCert) { RAINA_LOG("[raina] TLS requires setCACert(), or explicit setInsecure() for development.\n"); return false; }
#elif defined(ESP8266)
    if (!_fingerprint) { RAINA_LOG("[raina] TLS requires setFingerprint(), or explicit setInsecure() for development.\n"); return false; }
#else
    RAINA_LOG("[raina] TLS is unsupported on this target without a secure client.\n"); return false;
#endif
  }
  if (!_transport->connect(_host.c_str(), _port)) return false;
  _awaitingWelcome = true;
  _needsHandshake = false;
  _lastPingAt = millis();
  return sendHello();
}

void RainaClass::readRlpFrames() {
  if (!_transport) return;
  while (_transport->available() > 0) {
    int byteRead = _transport->read();
    if (byteRead < 0) break;
    _rxBuffer.push_back((uint8_t)byteRead);
    while (_rxBuffer.size() >= 4) {
      uint8_t type = _rxBuffer[0];
      size_t length = ((size_t)_rxBuffer[2] << 8) | _rxBuffer[3];
      if (length > _maxFrameSize) {
        RAINA_LOG("[raina] RLP frame exceeded maximum size (%u bytes).\n", (unsigned int)length);
        _transport->stop();
        _rxBuffer.clear();
        return;
      }
      if (_rxBuffer.size() < length + 4) break;
      std::vector<uint8_t> payload(_rxBuffer.begin() + 4, _rxBuffer.begin() + 4 + length);
      handleRlpFrame(type, payload.data(), length);
      _rxBuffer.erase(_rxBuffer.begin(), _rxBuffer.begin() + length + 4);
    }
  }
}

void RainaClass::handleRlpFrame(uint8_t type, const uint8_t* payload, size_t length) {
  if (type == RLP_WELCOME) {
    if (length < 3 || payload[0] != RLP_VERSION) { _transport->stop(); return; }
    _awaitingWelcome = false;
    if (!_connected) { _connected = true; RAINA_LOG("[raina] Connected over RLP.\n"); if (_onConnect) _onConnect(); }
    flush();
    return;
  }
  if (type == RLP_PING && length == 4) { sendRlpFrame(RLP_PONG, payload, length); return; }
  if (type == RLP_ERROR || type == RLP_DISCONNECT) { RAINA_LOG("[raina] RLP peer closed the session.\n"); _transport->stop(); return; }
  if (type != RLP_COMMAND || length < 7) return;
  uint32_t commandId = readU32(payload);
  uint16_t channel = readU16(payload + 4);
  uint8_t valueType = payload[6];
  const uint8_t* value = payload + 7;
  size_t valueLength = length - 7;
  String id((unsigned long)commandId);
  std::vector<uint8_t> ack;
  appendU32(ack, commandId);
  uint8_t status = 0;
  if (isDuplicateCommand(id.c_str())) { ack.push_back(status); sendRlpFrame(RLP_ACK, ack.data(), ack.size()); return; }
  const char* variable = nullptr;
  for (const auto& binding : _channels) if (binding.channel == channel) { variable = binding.variable.c_str(); break; }
  if (!variable) status = 2;

  RainaValue parsedValue;
  if (status == 0) {
    if (valueType == RLP_BOOL && valueLength == 1 && (value[0] == 0 || value[0] == 1)) {
      parsedValue = RainaValue(value[0] == 1);
    } else if (valueType == RLP_INT8 && valueLength == 1) {
      parsedValue = RainaValue((long)(int8_t)value[0]);
    } else if (valueType == RLP_UINT8 && valueLength == 1) {
      parsedValue = RainaValue((long)value[0]);
    } else if (valueType == RLP_INT16 && valueLength == 2) {
      parsedValue = RainaValue((long)(int16_t)readU16(value));
    } else if (valueType == RLP_UINT16 && valueLength == 2) {
      parsedValue = RainaValue((long)readU16(value));
    } else if (valueType == RLP_INT32 && valueLength == 4) {
      parsedValue = RainaValue((long)(int32_t)readU32(value));
    } else if (valueType == RLP_UINT32 && valueLength == 4) {
      parsedValue = RainaValue((long)readU32(value));
    } else if (valueType == RLP_FLOAT32 && valueLength == 4) {
      uint32_t bits = readU32(value);
      float f = 0.0f;
      memcpy(&f, &bits, sizeof(f));
      parsedValue = RainaValue((double)f);
    } else if (valueType == RLP_FLOAT64 && valueLength == 8) {
      uint64_t bits = 0;
      for (size_t i = 0; i < 8; ++i) bits = (bits << 8) | value[i];
      double number = 0.0;
      memcpy(&number, &bits, sizeof(number));
      parsedValue = RainaValue(number);
    } else if (valueType == RLP_STRING && valueLength >= 2 && readU16(value) == valueLength - 2) {
      String stringValue;
      for (size_t i = 2; i < valueLength; ++i) stringValue += (char)value[i];
      parsedValue = RainaValue(stringValue);
    } else {
      status = 1;
    }
  }
  if (status == 0) dispatchControl(variable, parsedValue);
  ack.push_back(status);
  sendRlpFrame(RLP_ACK, ack.data(), ack.size());
}

void RainaClass::maintainRlp() {
  if (WiFi.status() != WL_CONNECTED) {
    if (_connected && _onDisconnect) _onDisconnect();
    _connected = false; _awaitingWelcome = false;
    if (_transport) _transport->stop();
    return;
  }
  if (_needsHandshake && _transport && _transport->connected()) { _transport->stop(); _connected = false; _awaitingWelcome = false; }
  if (!_transport || !_transport->connected()) {
    if (_connected && _onDisconnect) _onDisconnect();
    _connected = false;
    unsigned long now = millis();
    if (_lastConnectAttempt && now - _lastConnectAttempt < _reconnectInterval) return;
    _lastConnectAttempt = now;
    connectRlp();
    return;
  }
  readRlpFrames();
  if (_connected && millis() - _lastPingAt >= 30000) { sendPing(); _lastPingAt = millis(); }
}

void RainaClass::run() {
  maintainWiFi();
  maintainRlp();
  if (_connected && _autoFlush && !_txQueue.empty()) flush();
  if (_autoFlushInterval > 0 && millis() - _lastFlushTime >= _autoFlushInterval) flush();
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

void RainaClass::dispatchControl(const char* variable, const RainaValue& value) {
  bool handled = false;

  // 1. Check declarative static handlers (registered via RAINA_WRITE macro)
  for (RainaHandlerReg* r = registryHead(); r; r = r->next) {
    if (strcmp(r->variable, variable) == 0 && r->fn) {
      r->fn(value);
      handled = true;
    }
  }

  // 2. Check imperative runtime handlers (registered via Raina.onWrite)
  for (const auto& h : _dynamicHandlers) {
    if (h.variable == variable && h.fn) {
      h.fn(value);
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
  if (!validKey(variable) || !callback) return;
  _dynamicHandlers.push_back({String(variable), callback});
  ensureChannel(variable);
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
  for (const char* p = key; *p; ++p) {
    const bool safe = (*p >= 'a' && *p <= 'z') || (*p >= 'A' && *p <= 'Z') ||
                      (*p >= '0' && *p <= '9') || *p == '_' || *p == '-' || *p == '.';
    if (!safe) { RAINA_LOG("[raina] Key dropped (unsupported character).\n"); return false; }
  }
  return true;
}

void RainaClass::queueMetric(const char* variable, uint8_t rlpType, bool b, long i, double d, const String& s) {
  if (!validKey(variable) || !ensureChannel(variable)) return;
  for (auto& m : _txQueue) {
    if (m.key == variable) {
      m.rlpType = rlpType;
      m.boolVal = b;
      m.intVal = i;
      m.doubleVal = d;
      m.strVal = s;
      return;
    }
  }
  _txQueue.push_back({String(variable), rlpType, b, i, d, s});
}

void RainaClass::send(const char* variable, bool value) {
  queueMetric(variable, RLP_BOOL, value, value ? 1 : 0, value ? 1.0 : 0.0, "");
}

void RainaClass::send(const char* variable, int value) {
  send(variable, (long)value);
}

void RainaClass::send(const char* variable, long value) {
  uint8_t type = (value >= 0 && value <= 65535) ? RLP_UINT16 : RLP_INT32;
  queueMetric(variable, type, value != 0, value, (double)value, "");
}

void RainaClass::send(const char* variable, float value) {
  queueMetric(variable, RLP_FLOAT64, value != 0.0f, (long)value, (double)value, "");
}

void RainaClass::send(const char* variable, double value) {
  queueMetric(variable, RLP_FLOAT64, value != 0.0, (long)value, value, "");
}

void RainaClass::send(const char* variable, const char* value) {
  queueMetric(variable, RLP_STRING, false, 0, 0.0, value ? String(value) : String(""));
}

void RainaClass::send(const char* variable, const String& value) {
  queueMetric(variable, RLP_STRING, false, 0, 0.0, value);
}

bool RainaClass::flush() {
  if (_txQueue.empty()) return true;
  if (!_connected || !_transport || !_transport->connected()) return false;

  std::vector<uint8_t> payload;
  payload.push_back(0); payload.push_back(0); // record count, filled after encoding
  uint16_t count = 0;
  for (const auto& metric : _txQueue) {
    uint16_t channel = channelFor(metric.key.c_str());
    if (!channel || count == 0xFFFF) continue;
    std::vector<uint8_t> record;
    record.push_back(0); // no timestamp
    appendU16(record, channel);

    if (metric.rlpType == RLP_BOOL) {
      record.push_back(RLP_BOOL);
      record.push_back(metric.boolVal ? 1 : 0);
    } else if (metric.rlpType == RLP_STRING) {
      size_t textLength = metric.strVal.length();
      if (textLength > 512) continue;
      record.push_back(RLP_STRING);
      appendU16(record, (uint16_t)textLength);
      record.insert(record.end(), metric.strVal.c_str(), metric.strVal.c_str() + textLength);
    } else if (metric.rlpType == RLP_UINT16) {
      record.push_back(RLP_UINT16);
      appendU16(record, (uint16_t)metric.intVal);
    } else if (metric.rlpType == RLP_INT32) {
      record.push_back(RLP_INT32);
      appendU32(record, (uint32_t)(int32_t)metric.intVal);
    } else {
      record.push_back(RLP_FLOAT64);
      appendFloat64(record, metric.doubleVal);
    }

    if (payload.size() + record.size() > _maxFrameSize) break;
    payload.insert(payload.end(), record.begin(), record.end());
    ++count;
  }
  if (!count) return false;
  payload[0] = (uint8_t)(count >> 8);
  payload[1] = (uint8_t)count;
  bool ok = sendRlpFrame(RLP_BATCH, payload.data(), payload.size());
  if (ok) {
    RAINA_LOG("[raina] Telemetry batch sent (%u values).\n", count);
    if (count >= _txQueue.size()) {
      _txQueue.clear();
    } else {
      _txQueue.erase(_txQueue.begin(), _txQueue.begin() + count);
    }
    _lastFlushTime = millis();
  } else {
    RAINA_LOG("[raina] Telemetry batch write failed.\n");
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
  if (isNull()) return RainaColor(0, 0, 0);

  // 1. String hex representation: "#RRGGBB", "RRGGBB", "#RGB"
  if (_type == RainaValueType::String) {
    return RainaColor::fromHex(_strVal.c_str());
  }

  // 2. Packed numeric 24-bit RGB integer (e.g. 0xFF00FF)
  if (_type == RainaValueType::Int || _type == RainaValueType::Double) {
    return RainaColor::fromRgb24((uint32_t)asLong());
  }

  return RainaColor(0, 0, 0);
}

void RainaClass::send(const char* variable, const RainaColor& color) {
  send(variable, color.toHex());
}

void RainaClass::sendColor(const char* variable, uint8_t r, uint8_t g, uint8_t b) {
  send(variable, RainaColor(r, g, b));
}
