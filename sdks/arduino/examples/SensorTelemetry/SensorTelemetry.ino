#include <Raina.h>

// ----------------------------------------------------------------------------
// Configuration
// ----------------------------------------------------------------------------
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASS     = "YOUR_WIFI_PASSWORD";
const char* RAINA_HOST    = "192.168.1.50";
const char* PROJECT_ID    = "proj_farm_01";
const char* PROJECT_TOKEN = "YOUR_HARDWARE_TOKEN";
const char* DEVICE_ID     = "sensor_node_01";

unsigned long lastSend = 0;
const unsigned long SEND_INTERVAL_MS = 5000;

void setup() {
  Serial.begin(115200);

  Raina.setDebug(true);
  Raina.begin(WIFI_SSID, WIFI_PASS, RAINA_HOST, PROJECT_ID, PROJECT_TOKEN, DEVICE_ID);
}

void loop() {
  Raina.run();

  // Send sensor telemetry periodically without blocking loop()
  if (millis() - lastSend >= SEND_INTERVAL_MS) {
    lastSend = millis();

    // Read your physical sensors (simulated here for demonstration)
    float temperature = 27.5 + (random(-10, 10) / 10.0);
    float humidity    = 65.0 + (random(-15, 15) / 10.0);
    float soilMoist   = 58.0 + (random(-5, 5) / 10.0);

    // Send all metrics together in a clean one-liner!
    // Transmits in a single MQTT packet with zero boilerplate
    Raina.send(
      "temperature",   temperature,
      "humidity",      humidity,
      "soil_moisture", soilMoist,
      "uptime_s",      (long)(millis() / 1000)
    );
  }
}
