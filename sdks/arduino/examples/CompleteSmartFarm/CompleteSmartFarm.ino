#include <Raina.h>

// ----------------------------------------------------------------------------
// Credentials & RLP gateway config
// ----------------------------------------------------------------------------
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASS     = "YOUR_WIFI_PASSWORD";
const char* RAINA_HOST    = "192.168.1.50";
const char* PROJECT_ID    = "proj_farm_01";
const char* PROJECT_TOKEN = "YOUR_HARDWARE_TOKEN";
const char* DEVICE_ID     = "esp32_greenhouse_01";
const uint16_t RAINA_PORT = 9000; // local RLP TCP; production uses TLS 8883 + setCACert()

// ----------------------------------------------------------------------------
// Pin Definitions
// ----------------------------------------------------------------------------
const int PIN_PUMP_RELAY = 18;
const int PIN_FAN_PWM    = 19;
const int PIN_STATUS_LED = 2;

// State Tracking
bool pumpActive = false;
int fanDuty = 0;
unsigned long lastTelemetry = 0;

// ----------------------------------------------------------------------------
// Actuators / Cloud Commands (Executed automatically when user taps dashboard)
// ----------------------------------------------------------------------------

// 1. Digital Toggle Widget: "pump_relay" (0 or 1)
RAINA_ON("pump_relay") {
  pumpActive = value.asBool();
  digitalWrite(PIN_PUMP_RELAY, pumpActive ? HIGH : LOW);

  // Echo state back so all dashboard clients and mobile apps sync immediately
  Raina.send("pump_relay", pumpActive ? 1 : 0);
}

// 2. Slider Widget: "fan_speed" (0 to 100 %)
RAINA_ON("fan_speed") {
  int speedPercent = value.asInt();
  speedPercent = constrain(speedPercent, 0, 100);

  // Map 0-100% to 8-bit PWM (0-255)
  fanDuty = map(speedPercent, 0, 100, 0, 255);
  analogWrite(PIN_FAN_PWM, fanDuty);

  Raina.send("fan_speed", speedPercent);
}

// ----------------------------------------------------------------------------
// Setup & Main Loop
// ----------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);

  // Setup Hardware Pins
  pinMode(PIN_PUMP_RELAY, OUTPUT);
  pinMode(PIN_FAN_PWM, OUTPUT);
  pinMode(PIN_STATUS_LED, OUTPUT);
  digitalWrite(PIN_PUMP_RELAY, LOW);

  // Optional: Connection Lifecycle Callbacks
  Raina.onConnect([]() {
    digitalWrite(PIN_STATUS_LED, HIGH); // Solid LED when online
  });

  Raina.onDisconnect([]() {
    digitalWrite(PIN_STATUS_LED, LOW);  // LED off when disconnected
  });

  // Enable Verbose Debug Output
  Raina.setDebug(true);

  // Connect to WiFi and the raina RLP gateway
  Raina.begin(WIFI_SSID, WIFI_PASS, RAINA_HOST, PROJECT_ID, PROJECT_TOKEN, DEVICE_ID, RAINA_PORT);
}

void loop() {
  // 1. Maintain WiFi and RLP connection in background (non-blocking)
  Raina.run();

  // 2. Sample and upload sensor metrics every 3 seconds
  if (millis() - lastTelemetry >= 3000) {
    lastTelemetry = millis();

    // Read real analog/digital sensors or simulate values
    float tempC    = 28.4 + (random(-10, 10) / 10.0);
    float humidity = 65.2 + (random(-20, 20) / 10.0);
    float soilMoist= 55.0 + (random(-15, 15) / 10.0);

    // Transmit all metrics together in one compact RLP batch (auto-sent in 1 frame)
    Raina.send(
      "temperature",   tempC,
      "humidity",      humidity,
      "soil_moisture", soilMoist
    );
  }
}
