#ifndef MOCK_ARDUINO_H
#define MOCK_ARDUINO_H

#include <iostream>
#include <string>
#include <sstream>
#include <vector>
#include <map>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstdarg>
#include <cstring>
#include <cmath>
#include <algorithm>

typedef uint8_t byte;

// ----------------------------------------------------------------------------
// Mock Arduino String Class
// ----------------------------------------------------------------------------
class String {
 public:
  std::string s;

  String() : s("") {}
  String(const char* c) : s(c ? c : "") {}
  String(const std::string& str) : s(str) {}
  String(int v) : s(std::to_string(v)) {}
  String(long v) : s(std::to_string(v)) {}
  String(unsigned long v) : s(std::to_string(v)) {}
  String(float v) : s(std::to_string(v)) {}
  String(double v) : s(std::to_string(v)) {}

  const char* c_str() const { return s.c_str(); }
  size_t length() const { return s.length(); }

  bool operator==(const String& other) const { return s == other.s; }
  bool operator==(const char* other) const { return s == (other ? other : ""); }
  bool operator<(const String& other) const { return s < other.s; }

  String operator+(const String& other) const { return String(s + other.s); }
  String operator+(const char* other) const { return String(s + (other ? other : "")); }
  friend String operator+(const char* a, const String& b) { return String((a ? a : "") + b.s); }

  void trim() {
    size_t first = s.find_first_not_of(" \t\n\r");
    if (first == std::string::npos) { s = ""; return; }
    size_t last = s.find_last_not_of(" \t\n\r");
    s = s.substr(first, (last - first + 1));
  }

  void toLowerCase() {
    std::transform(s.begin(), s.end(), s.begin(), ::tolower);
  }
};

// ----------------------------------------------------------------------------
// Mock Arduino Constants & Functions
// ----------------------------------------------------------------------------
#define HIGH 1
#define LOW 0
#define OUTPUT 1
#define INPUT 0
#define WL_CONNECTED 3
#define WIFI_STA 1

inline unsigned long millis() {
  static auto start = std::chrono::steady_clock::now();
  auto now = std::chrono::steady_clock::now();
  return std::chrono::duration_cast<std::chrono::milliseconds>(now - start).count();
}

inline void delay(unsigned long ms) {}

class MockSerial {
 public:
  void begin(long) {}
  void printf(const char* format, ...) {
    va_list args;
    va_start(args, format);
    vprintf(format, args);
    va_end(args);
  }
  void print(const char* s) { std::cout << s; }
  void println(const char* s) { std::cout << s << std::endl; }
};
static MockSerial Serial;

class IPAddress {
 public:
  String toString() const { return String("192.168.1.123"); }
};

class MockWiFi {
 public:
  void mode(int) {}
  int status() { return WL_CONNECTED; }
  void begin(const char*, const char*) {}
  void reconnect() {}
  IPAddress localIP() { return IPAddress(); }
};
static MockWiFi WiFi;

class WiFiMulti {
 public:
  void addAP(const char*, const char*) {}
  int run() { return WL_CONNECTED; }
};

class Client {};
class WiFiClient : public Client {};
class WiFiClientSecure : public Client {
 public:
  void setInsecure() {}
  void setCACert(const char*) {}
};

// ----------------------------------------------------------------------------
// Mock ArduinoJson (Minimal standard-compliant subset)
// ----------------------------------------------------------------------------
#define ARDUINOJSON_VERSION_MAJOR 7

class JsonObject;

class JsonVariantConst {
 public:
  enum Type { J_NULL, J_BOOL, J_INT, J_DOUBLE, J_STR, J_OBJ };
  Type type = J_NULL;
  bool bVal = false;
  int64_t iVal = 0;
  double dVal = 0.0;
  std::string sVal = "";
  std::map<std::string, JsonVariantConst> objVal;

  JsonVariantConst() : type(J_NULL) {}
  JsonVariantConst(bool b) : type(J_BOOL), bVal(b), dVal(b ? 1.0 : 0.0) {}
  JsonVariantConst(int i) : type(J_INT), iVal(i), dVal(i) {}
  JsonVariantConst(double d) : type(J_DOUBLE), dVal(d), iVal((int64_t)d) {}
  JsonVariantConst(const char* s) : type(J_STR), sVal(s ? s : "") {}
  JsonVariantConst(const std::string& s) : type(J_STR), sVal(s) {}
  JsonVariantConst(const std::map<std::string, JsonVariantConst>& m) : type(J_OBJ), objVal(m) {}

  JsonVariantConst& operator=(bool b) { type = J_BOOL; bVal = b; dVal = b ? 1.0 : 0.0; return *this; }
  JsonVariantConst& operator=(int i) { type = J_INT; iVal = i; dVal = i; return *this; }
  JsonVariantConst& operator=(long l) { type = J_INT; iVal = l; dVal = l; return *this; }
  JsonVariantConst& operator=(float f) { type = J_DOUBLE; dVal = f; iVal = (int64_t)f; return *this; }
  JsonVariantConst& operator=(double d) { type = J_DOUBLE; dVal = d; iVal = (int64_t)d; return *this; }
  JsonVariantConst& operator=(const char* s) { type = J_STR; sVal = s ? s : ""; return *this; }
  JsonVariantConst& operator=(const String& str) { type = J_STR; sVal = str.c_str(); return *this; }

  template <typename T> bool is() const {
    if (std::is_same<T, bool>::value) return type == J_BOOL;
    if (std::is_same<T, const char*>::value || std::is_same<T, String>::value) return type == J_STR;
    if (std::is_same<T, int>::value) return type == J_INT;
    if (std::is_same<T, double>::value) return type == J_DOUBLE || type == J_INT;
    if (std::is_same<T, uint32_t>::value || std::is_same<T, long>::value) return type == J_INT;
    if (std::is_same<T, JsonObject>::value) return type == J_OBJ;
    return false;
  }

  template <typename T> T as() const;

  bool isNull() const { return type == J_NULL; }

  JsonVariantConst operator[](const char* key) const {
    if (type == J_OBJ) {
      auto it = objVal.find(key ? key : "");
      if (it != objVal.end()) return it->second;
    }
    return JsonVariantConst();
  }
};

template <> inline bool JsonVariantConst::as<bool>() const {
  if (type == J_BOOL) return bVal;
  if (type == J_STR) {
    if (sVal == "true" || sVal == "1" || sVal == "on" || sVal == "yes") return true;
    return false;
  }
  return dVal != 0.0;
}

template <> inline int JsonVariantConst::as<int>() const {
  if (type == J_INT) return (int)iVal;
  if (type == J_DOUBLE) return (int)dVal;
  if (type == J_STR) return std::atoi(sVal.c_str());
  if (type == J_BOOL) return bVal ? 1 : 0;
  return 0;
}

template <> inline long JsonVariantConst::as<long>() const {
  if (type == J_INT) return (long)iVal;
  if (type == J_DOUBLE) return (long)dVal;
  if (type == J_STR) return std::atol(sVal.c_str());
  return 0;
}

template <> inline float JsonVariantConst::as<float>() const {
  if (type == J_DOUBLE) return (float)dVal;
  if (type == J_INT) return (float)iVal;
  if (type == J_STR) return std::atof(sVal.c_str());
  return 0.0f;
}

template <> inline double JsonVariantConst::as<double>() const {
  if (type == J_DOUBLE) return dVal;
  if (type == J_INT) return (double)iVal;
  if (type == J_STR) return std::atof(sVal.c_str());
  return 0.0;
}

template <> inline const char* JsonVariantConst::as<const char*>() const {
  return sVal.c_str();
}

template <> inline String JsonVariantConst::as<String>() const {
  return String(sVal.c_str());
}

inline void serializeJson(const JsonVariantConst& v, String& out) {
  if (v.type == JsonVariantConst::J_BOOL) out = v.bVal ? "true" : "false";
  else if (v.type == JsonVariantConst::J_INT) out = String((long)v.iVal);
  else if (v.type == JsonVariantConst::J_DOUBLE) out = String(v.dVal);
  else if (v.type == JsonVariantConst::J_STR) out = String(v.sVal.c_str());
  else out = "null";
}

struct JsonPair {
  struct Key {
    std::string k;
    Key(const std::string& key) : k(key) {}
    const char* c_str() const { return k.c_str(); }
  };
  Key _key;
  JsonVariantConst _val;
  JsonPair(const std::string& k, const JsonVariantConst& v) : _key(k), _val(v) {}
  Key key() const { return _key; }
  JsonVariantConst value() const { return _val; }
};

class JsonObject {
 public:
  std::map<std::string, JsonVariantConst> map;
  std::vector<JsonPair> pairs;

  auto begin() const { return pairs.begin(); }
  auto end() const { return pairs.end(); }
};

template <> inline JsonObject JsonVariantConst::as<JsonObject>() const {
  JsonObject obj;
  if (type == J_OBJ) {
    for (const auto& kv : objVal) {
      obj.map[kv.first] = kv.second;
      obj.pairs.push_back(JsonPair(kv.first, kv.second));
    }
  }
  return obj;
}

class JsonDocument {
 public:
  std::map<std::string, JsonVariantConst> data;

  JsonVariantConst& operator[](const char* key) {
    return data[key ? key : ""];
  }

  JsonVariantConst operator[](const char* key) const {
    auto it = data.find(key ? key : "");
    if (it != data.end()) return it->second;
    return JsonVariantConst();
  }

  size_t size() const { return data.size(); }
  void clear() { data.clear(); }

  template <typename T> bool is() const {
    if (std::is_same<T, JsonObject>::value) return true;
    return false;
  }

  template <typename T> T as() const {
    JsonObject obj;
    for (const auto& kv : data) {
      obj.map[kv.first] = kv.second;
      obj.pairs.push_back(JsonPair(kv.first, kv.second));
    }
    return obj;
  }
};

struct DeserializationError {
  int code = 0;
  operator bool() const { return code != 0; }
  const char* c_str() const { return code == 0 ? "Ok" : "Error"; }
};

inline DeserializationError deserializeJson(JsonDocument& doc, const char* json, size_t len) {
  doc.clear();
  std::string s(json, len);
  // Extremely simple tokenizer for test purposes
  size_t pos = 0;
  while ((pos = s.find('"', pos)) != std::string::npos) {
    size_t keyEnd = s.find('"', pos + 1);
    if (keyEnd == std::string::npos) break;
    std::string key = s.substr(pos + 1, keyEnd - pos - 1);
    size_t colon = s.find(':', keyEnd);
    if (colon == std::string::npos) break;
    size_t valStart = s.find_first_not_of(" \t\n\r", colon + 1);
    if (valStart == std::string::npos) break;

    if (s[valStart] == '{') {
      int depth = 0;
      size_t objEnd = valStart;
      for (; objEnd < s.size(); ++objEnd) {
        if (s[objEnd] == '{') depth++;
        else if (s[objEnd] == '}') {
          depth--;
          if (depth == 0) {
            objEnd++;
            break;
          }
        }
      }
      std::string inner = s.substr(valStart, objEnd - valStart);
      JsonDocument subDoc;
      deserializeJson(subDoc, inner.c_str(), inner.size());
      doc[key.c_str()] = JsonVariantConst(subDoc.data);
      pos = objEnd;
    } else if (s[valStart] == '"') {
      size_t valEnd = s.find('"', valStart + 1);
      doc[key.c_str()] = JsonVariantConst(s.substr(valStart + 1, valEnd - valStart - 1).c_str());
      pos = valEnd + 1;
    } else if (s.compare(valStart, 4, "true") == 0) {
      doc[key.c_str()] = JsonVariantConst(true);
      pos = valStart + 4;
    } else if (s.compare(valStart, 5, "false") == 0) {
      doc[key.c_str()] = JsonVariantConst(false);
      pos = valStart + 5;
    } else {
      size_t valEnd = s.find_first_of(",}\" \t\n\r", valStart);
      std::string valStr = s.substr(valStart, valEnd - valStart);
      if (valStr.find('.') != std::string::npos) {
        doc[key.c_str()] = JsonVariantConst(std::atof(valStr.c_str()));
      } else {
        doc[key.c_str()] = JsonVariantConst(std::atoi(valStr.c_str()));
      }
      pos = valEnd;
    }
  }
  return DeserializationError{0};
}

inline DeserializationError deserializeJson(JsonDocument& doc, uint8_t* payload, size_t len) {
  return deserializeJson(doc, (const char*)payload, len);
}

inline void serializeJson(const JsonDocument& doc, String& out) {
  std::ostringstream ss;
  ss << "{";
  bool first = true;
  for (const auto& kv : doc.data) {
    if (!first) ss << ",";
    first = false;
    ss << "\"" << kv.first << "\":";
    if (kv.second.type == JsonVariantConst::J_BOOL) {
      ss << (kv.second.bVal ? "true" : "false");
    } else if (kv.second.type == JsonVariantConst::J_INT) {
      ss << kv.second.iVal;
    } else if (kv.second.type == JsonVariantConst::J_DOUBLE) {
      ss << kv.second.dVal;
    } else {
      ss << "\"" << kv.second.sVal << "\"";
    }
  }
  ss << "}";
  out = String(ss.str().c_str());
}

// ----------------------------------------------------------------------------
// Mock PubSubClient
// ----------------------------------------------------------------------------
typedef void (*MqttCallbackFn)(char*, uint8_t*, unsigned int);

class PubSubClient {
 public:
  Client* _client = nullptr;
  std::string _host;
  uint16_t _port = 1883;
  MqttCallbackFn _callback = nullptr;
  bool _connected = false;
  int _state = 0;

  // Test recording
  struct PublishedMessage {
    std::string topic;
    std::string payload;
    bool retain;
  };
  std::vector<PublishedMessage> published;
  std::vector<std::string> subscribed;

  PubSubClient(Client& c) : _client(&c) {}

  void setClient(Client& c) { _client = &c; }
  void setServer(const char* h, uint16_t p) { _host = h; _port = p; }
  void setCallback(MqttCallbackFn cb) { _callback = cb; }
  void setBufferSize(uint16_t) {}
  void setKeepAlive(uint16_t) {}

  bool connect(const char* id, const char* user, const char* pass,
               const char* willTopic, uint8_t willQos, bool willRetain, const char* willPayload) {
    _connected = true;
    _state = 0;
    return true;
  }

  bool publish(const char* topic, const char* payload, bool retain = false) {
    published.push_back({topic ? topic : "", payload ? payload : "", retain});
    return true;
  }

  bool subscribe(const char* topic, uint8_t qos = 0) {
    subscribed.push_back(topic ? topic : "");
    return true;
  }

  bool connected() { return _connected; }
  void loop() {}
  int state() { return _state; }

  // Test helper: simulate incoming MQTT frame
  void simulateIncoming(const char* topic, const char* payload) {
    if (_callback) {
      _callback((char*)topic, (uint8_t*)payload, strlen(payload));
    }
  }
};

#endif // MOCK_ARDUINO_H
