#include <Raina.h>

// ----------------------------------------------------------------------------
// Configuration (Fill in your credentials)
// ----------------------------------------------------------------------------
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASS     = "YOUR_WIFI_PASSWORD";
const char* RAINA_HOST    = "192.168.1.50";            // IP or domain of raina server
const char* PROJECT_ID    = "proj_farm_01";            // Your Project ID
const char* PROJECT_TOKEN = "YOUR_HARDWARE_TOKEN"; // Device token from Raina
const char* DEVICE_ID     = "relay_node_01";          // Unique Device ID
const uint16_t RAINA_PORT = 9000;                      // local RLP TCP; production uses TLS 8883 + setCACert()

const int RELAY_PIN = 2; // Built-in LED on most ESP32 boards

// ----------------------------------------------------------------------------
// Business Logic: React to Dashboard Toggle / Button
// ----------------------------------------------------------------------------
RAINA_ON("relay") {
  bool isOn = value.asBool();
  digitalWrite(RELAY_PIN, isOn ? HIGH : LOW);
  
  // Echo the confirmed state back to raina (Auto-flushed automatically!)
  Raina.send("relay", isOn);
}

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  // Enable debug logs in Serial monitor
  Raina.setDebug(true);

  // Initialize raina (manages WiFi and RLP connection automatically)
  Raina.begin(WIFI_SSID, WIFI_PASS, RAINA_HOST, PROJECT_ID, PROJECT_TOKEN, DEVICE_ID, RAINA_PORT);
}

void loop() {
  // Keeps WiFi and RLP alive, handles auto-reconnect and executes commands
  Raina.run();
}
