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
#include <deque>

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
  String& operator+=(const String& other) { s += other.s; return *this; }
  String& operator+=(const char* other) { s += other ? other : ""; return *this; }
  String& operator+=(char value) { s += value; return *this; }

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
  bool _connected = true;
  void mode(int) {}
  int status() { return _connected ? WL_CONNECTED : 0; }
  void begin(const char*, const char*) {}
  void reconnect() { _connected = true; }
  IPAddress localIP() { return IPAddress(); }
  void setConnected(bool c) { _connected = c; }
};
static MockWiFi WiFi;

class WiFiMulti {
 public:
  void addAP(const char*, const char*) {}
  int run() { return WL_CONNECTED; }
};

class Client {
 public:
  bool _connected = false;
  std::vector<uint8_t> written;
  std::deque<uint8_t> incoming;
  bool connect(const char*, uint16_t) { _connected = true; return true; }
  bool connected() { return _connected; }
  void stop() { _connected = false; }
  size_t write(const uint8_t* data, size_t length) { if (!_connected) return 0; written.insert(written.end(), data, data + length); return length; }
  size_t write(uint8_t value) { return write(&value, 1); }
  int available() { return (int)incoming.size(); }
  int read() { if (incoming.empty()) return -1; uint8_t value = incoming.front(); incoming.pop_front(); return value; }
  void inject(const std::vector<uint8_t>& bytes) { incoming.insert(incoming.end(), bytes.begin(), bytes.end()); }
};
class WiFiClient : public Client {};
class WiFiClientSecure : public Client {
 public:
  void setInsecure() {}
  void setCACert(const char*) {}
};

#endif // MOCK_ARDUINO_H
