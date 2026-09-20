#include "mock_arduino.h"
#include "../src/Raina.h"
#include <cassert>
#include <iostream>

// ----------------------------------------------------------------------------
// Test Tracking State
// ----------------------------------------------------------------------------
static bool g_pumpState = false;
static int g_pumpCalls = 0;
static int g_fanSpeed = 0;
static bool g_dynamicRelayState = false;
static RainaColor g_stripColor(0, 0, 0);
static bool g_onConnectFired = false;
static bool g_onDisconnectFired = false;

// ----------------------------------------------------------------------------
// Register Actuators using RAINA_ON Macro
// ----------------------------------------------------------------------------
RAINA_ON("pump_relay") {
  ++g_pumpCalls;
  g_pumpState = value.asBool();
}

RAINA_ON("fan_speed") {
  g_fanSpeed = value.asInt();
}

RAINA_ON("rgb_strip") {
  g_stripColor = value.asColor();
}

// ----------------------------------------------------------------------------
// Test Suite
// ----------------------------------------------------------------------------
int main() {
  std::cout << "==================================================\n";
  std::cout << "🧪 Running Raina Arduino SDK Native Unit Tests...\n";
  std::cout << "==================================================\n";

  // --------------------------------------------------------------------------
  // TEST 1: RainaValue type conversions
  // --------------------------------------------------------------------------
  std::cout << "▶ [Test 1] RainaValue type conversions... ";
  {
    JsonVariantConst vTrue(true);
    RainaValue val1(vTrue);
    assert(val1.asBool() == true);
    assert(val1.asInt() == 1);

    JsonVariantConst vStrOn("on");
    RainaValue val2(vStrOn);
    assert(val2.asBool() == true);

    JsonVariantConst vStr1("1");
    RainaValue val3(vStr1);
    assert(val3.asBool() == true);
    assert(val3.asInt() == 1);

    JsonVariantConst vStrFalse("false");
    RainaValue val4(vStrFalse);
    assert(val4.asBool() == false);

    JsonVariantConst vNum(42.5);
    RainaValue val5(vNum);
    assert(val5.asInt() == 42);
    assert(std::abs(val5.asFloat() - 42.5f) < 0.001f);
  }
  std::cout << "✅ PASSED\n";

  // --------------------------------------------------------------------------
  // TEST 2: Initialization, LWT, and Subscriptions
  // --------------------------------------------------------------------------
  std::cout << "▶ [Test 2] Broker initialization & LWT configuration... ";
  {
    Raina.setDebug(false);
    Raina.begin("mock_ssid", "mock_pass", "127.0.0.1", "proj_farm", "token_123", "esp32_dev01", 1883);
    Raina.run();

    assert(Raina.connected() == true);
    assert(Raina.projectId() == "proj_farm");
    assert(Raina.deviceId() == "esp32_dev01");

    PubSubClient& mqtt = Raina.getMqttClient();

    // Verify online status published
    bool foundOnline = false;
    for (const auto& msg : mqtt.published) {
      if (msg.topic == "projects/proj_farm/devices/esp32_dev01/status" &&
          msg.payload.find("online") != std::string::npos) {
        foundOnline = true;
        break;
      }
    }
    assert(foundOnline == true);

    // Verify subscriptions to commands
    bool subCmd = false;
    bool subCtrl = false;
    for (const auto& topic : mqtt.subscribed) {
      if (topic == "v1/proj_farm/devices/esp32_dev01/commands") subCmd = true;
      if (topic == "projects/proj_farm/devices/esp32_dev01/control") subCtrl = true;
    }
    assert(subCmd && subCtrl);
  }
  std::cout << "✅ PASSED\n";

  // --------------------------------------------------------------------------
  // TEST 3: RAINA_ON Macro Inbound Command Dispatching
  // --------------------------------------------------------------------------
  std::cout << "▶ [Test 3] Inbound command dispatching via RAINA_ON... ";
  {
    PubSubClient& mqtt = Raina.getMqttClient();

    // Format A: Direct dictionary with anti-replay envelope
    const char* payload1 = "{\"pump_relay\": true, \"cmd_id\": \"cmd_abc123\", \"ts\": 1718000000000}";
    mqtt.simulateIncoming("v1/proj_farm/devices/esp32_dev01/commands", payload1);
    assert(g_pumpState == true);

    // The server publishes compatibility copies to modern and legacy topics.
    // A repeated cmd_id must execute the actuator only once.
    int callsBeforeDuplicate = g_pumpCalls;
    mqtt.simulateIncoming("projects/proj_farm/devices/esp32_dev01/control", payload1);
    assert(g_pumpCalls == callsBeforeDuplicate);

    const char* payload2 = "{\"pump_relay\": false}";
    mqtt.simulateIncoming("v1/proj_farm/devices/esp32_dev01/commands", payload2);
    assert(g_pumpState == false);

    // Format B: Integer command for fan speed
    const char* payload3 = "{\"fan_speed\": 85, \"cmd_id\": \"cmd_456\"}";
    mqtt.simulateIncoming("v1/proj_farm/devices/esp32_dev01/commands", payload3);
    assert(g_fanSpeed == 85);

    // Format C: Key-Value wrapper format
    const char* payload4 = "{\"variable\": \"pump_relay\", \"value\": true}";
    mqtt.simulateIncoming("projects/proj_farm/devices/esp32_dev01/control", payload4);
    assert(g_pumpState == true);
  }
  std::cout << "✅ PASSED\n";

  // --------------------------------------------------------------------------
  // TEST 4: Dynamic onWrite Handler Registration
  // --------------------------------------------------------------------------
  std::cout << "▶ [Test 4] Dynamic runtime handler registration (Raina.onWrite)... ";
  {
    Raina.onWrite("dynamic_relay", [](RainaValue val) {
      g_dynamicRelayState = val.asBool();
    });

    PubSubClient& mqtt = Raina.getMqttClient();
    const char* payload = "{\"dynamic_relay\": true}";
    mqtt.simulateIncoming("v1/proj_farm/devices/esp32_dev01/commands", payload);
    assert(g_dynamicRelayState == true);
  }
  std::cout << "✅ PASSED\n";

  // --------------------------------------------------------------------------
  // TEST 5: One-Liner Variadic Telemetry Send
  // --------------------------------------------------------------------------
  std::cout << "▶ [Test 5] Variadic one-liner multi-metric send... ";
  {
    PubSubClient& mqtt = Raina.getMqttClient();
    size_t beforeCount = mqtt.published.size();

    // Send multiple metrics in a single line
    Raina.send("temperature", 28.5, "humidity", 65.0, "soil_moisture", 58.0);

    assert(mqtt.published.size() == beforeCount + 1);
    const auto& last = mqtt.published.back();
    assert(last.topic == "v1/proj_farm/devices/esp32_dev01/telemetry");
    assert(last.payload.find("\"temperature\":28.5") != std::string::npos);
    assert(last.payload.find("\"humidity\":65") != std::string::npos);
    assert(last.payload.find("\"soil_moisture\":58") != std::string::npos);
  }
  std::cout << "✅ PASSED\n";

  // --------------------------------------------------------------------------
  // TEST 6: Auto-Flush via Raina.run() (Zero-Flush DX)
  // --------------------------------------------------------------------------
  std::cout << "▶ [Test 6] Auto-flush via Raina.run()... ";
  {
    PubSubClient& mqtt = Raina.getMqttClient();
    size_t beforeCount = mqtt.published.size();

    // Dev calls send on separate lines without .flush()
    Raina.send("light_lux", 1200);
    Raina.send("battery_pct", 95);

    // Has NOT flushed yet before run()
    assert(mqtt.published.size() == beforeCount);

    // loop() calls Raina.run()
    Raina.run();

    // Now it should be automatically flushed in 1 MQTT packet!
    assert(mqtt.published.size() == beforeCount + 1);
    const auto& last = mqtt.published.back();
    assert(last.topic == "v1/proj_farm/devices/esp32_dev01/telemetry");
    assert(last.payload.find("\"light_lux\":1200") != std::string::npos);
    assert(last.payload.find("\"battery_pct\":95") != std::string::npos);
  }
  std::cout << "✅ PASSED\n";

  // --------------------------------------------------------------------------
  // TEST 7: RainaColor Conversions & Color Models
  // --------------------------------------------------------------------------
  std::cout << "▶ [Test 7] RainaColor conversions (Hex, RGB, HSV, RGB565)... ";
  {
    // Construction & toHex / toRgb24 / toRgb565
    RainaColor red(255, 0, 0);
    assert(red.toHex() == "#FF0000");
    assert(red.toRgb24() == 0xFF0000);
    assert(red.toRgb565() == 0xF800); // 31 << 11

    RainaColor custom(255, 128, 64);
    assert(custom.toHex() == "#FF8040");
    assert(custom.toRgb24() == 0xFF8040);

    // fromHex 6-digit with '#'
    RainaColor c1 = RainaColor::fromHex("#00FF80");
    assert(c1.r == 0 && c1.g == 255 && c1.b == 128);

    // fromHex 6-digit without '#'
    RainaColor c2 = RainaColor::fromHex("00FF80");
    assert(c2.r == 0 && c2.g == 255 && c2.b == 128);

    // fromHex 3-digit shorthand
    RainaColor c3 = RainaColor::fromHex("#F0A");
    assert(c3.r == 0xFF && c3.g == 0x00 && c3.b == 0xAA);

    // fromHsv: Pure Red (0 deg)
    RainaColor hRed = RainaColor::fromHsv(0, 100, 100);
    assert(hRed.r == 255 && hRed.g == 0 && hRed.b == 0);

    // fromHsv: Pure Green (120 deg)
    RainaColor hGreen = RainaColor::fromHsv(120, 100, 100);
    assert(hGreen.r == 0 && hGreen.g == 255 && hGreen.b == 0);

    // fromHsv: Pure Blue (240 deg)
    RainaColor hBlue = RainaColor::fromHsv(240, 100, 100);
    assert(hBlue.r == 0 && hBlue.g == 0 && hBlue.b == 255);

    // fromRgb24
    RainaColor c24 = RainaColor::fromRgb24(0x123456);
    assert(c24.r == 0x12 && c24.g == 0x34 && c24.b == 0x56);
  }
  std::cout << "✅ PASSED\n";

  // --------------------------------------------------------------------------
  // TEST 8: Color Command Dispatching & Color Telemetry
  // --------------------------------------------------------------------------
  std::cout << "▶ [Test 8] Color command parsing & telemetry send... ";
  {
    PubSubClient& mqtt = Raina.getMqttClient();

    // 1. Inbound Hex color string via commands topic
    const char* hexPayload = "{\"rgb_strip\": \"#00FF80\"}";
    mqtt.simulateIncoming("v1/proj_farm/devices/esp32_dev01/commands", hexPayload);
    assert(g_stripColor.r == 0);
    assert(g_stripColor.g == 255);
    assert(g_stripColor.b == 128);
    assert(g_stripColor.toHex() == "#00FF80");

    // 2. Inbound RGB Object via commands topic
    const char* rgbObjPayload = "{\"rgb_strip\": {\"r\": 255, \"g\": 120, \"b\": 40}}";
    mqtt.simulateIncoming("v1/proj_farm/devices/esp32_dev01/commands", rgbObjPayload);
    assert(g_stripColor.r == 255);
    assert(g_stripColor.g == 120);
    assert(g_stripColor.b == 40);

    // 3. Inbound HSV Object via commands topic
    const char* hsvObjPayload = "{\"rgb_strip\": {\"h\": 240, \"s\": 100, \"v\": 100}}";
    mqtt.simulateIncoming("v1/proj_farm/devices/esp32_dev01/commands", hsvObjPayload);
    assert(g_stripColor.r == 0);
    assert(g_stripColor.g == 0);
    assert(g_stripColor.b == 255);

    // 4. Outbound Color Telemetry via Raina.send(var, RainaColor)
    size_t beforeCount = mqtt.published.size();
    Raina.send("light_color", RainaColor(255, 64, 32));
    Raina.run(); // Flush

    assert(mqtt.published.size() == beforeCount + 1);
    const auto& last1 = mqtt.published.back();
    assert(last1.topic == "v1/proj_farm/devices/esp32_dev01/telemetry");
    assert(last1.payload.find("\"light_color\":\"#FF4020\"") != std::string::npos);

    // 5. Outbound Color Telemetry via Raina.sendColor(var, r, g, b)
    beforeCount = mqtt.published.size();
    Raina.sendColor("ambient_rgb", 10, 20, 30);
    Raina.run(); // Flush

    assert(mqtt.published.size() == beforeCount + 1);
    const auto& last2 = mqtt.published.back();
    assert(last2.topic == "v1/proj_farm/devices/esp32_dev01/telemetry");
    assert(last2.payload.find("\"ambient_rgb\":\"#0A141E\"") != std::string::npos);
  }
  std::cout << "✅ PASSED\n";

  // --------------------------------------------------------------------------
  // TEST 9: Malformed JSON, Fuzzing & SQLi/XSS Payload Safety
  // --------------------------------------------------------------------------
  std::cout << "▶ [Test 9] Malformed JSON, Fuzzing & Injection Safety... ";
  {
    PubSubClient& mqtt = Raina.getMqttClient();
    g_pumpState = false;
    g_fanSpeed = 10;

    // 1. Incomplete / truncated JSON
    mqtt.simulateIncoming("v1/proj_farm/devices/esp32_dev01/commands", "{\"pump_relay\": ");
    assert(g_pumpState == false); // Should NOT mutate state

    // 2. Unbalanced braces
    mqtt.simulateIncoming("v1/proj_farm/devices/esp32_dev01/commands", "{\"pump_relay\": true}}");
    assert(g_pumpState == false);

    // 3. Raw garbage binary bytes
    const char garbage[] = {'{', '\x00', '\xFF', '\xAA', '\x55', '}'};
    mqtt.simulateIncoming("v1/proj_farm/devices/esp32_dev01/commands", garbage);
    assert(g_pumpState == false);

    // 4. SQL Injection payload in value
    mqtt.simulateIncoming("v1/proj_farm/devices/esp32_dev01/commands",
                          "{\"pump_relay\": \"'; DROP TABLE iot_devices;--\"}");
    assert(g_pumpState == false); // Non-boolean string evaluated safely to false

    // 5. Command targeted at non-existent actuator
    mqtt.simulateIncoming("v1/proj_farm/devices/esp32_dev01/commands",
                          "{\"unregistered_device_uuid_xyz\": 99999}");
    assert(g_pumpState == false);
    assert(g_fanSpeed == 10);

    // 6. Explicit null value in Key-Value wrapper
    mqtt.simulateIncoming("projects/proj_farm/devices/esp32_dev01/control",
                          "{\"variable\": \"pump_relay\", \"value\": null}");
    assert(g_pumpState == false);
  }
  std::cout << "✅ PASSED\n";

  // --------------------------------------------------------------------------
  // TEST 10: Strict Key Validation & Boundary Hardening
  // --------------------------------------------------------------------------
  std::cout << "▶ [Test 10] Strict key validation & length bounds... ";
  {
    PubSubClient& mqtt = Raina.getMqttClient();

    // 1. Null pointer key (must discard safely without segfault)
    Raina.send((const char*)nullptr, 123);

    // 2. Empty string key (must discard)
    Raina.send("", 456);

    // 3. 65-character key (exceeds MAX_KEY_LEN = 64, must discard)
    std::string key65(65, 'k');
    Raina.send(key65.c_str(), 789);

    // 4. Exactly 64-character key (at boundary, must accept)
    std::string key64(64, 'm');
    Raina.send(key64.c_str(), 100);

    size_t beforeCount = mqtt.published.size();
    Raina.run(); // Flush

    assert(mqtt.published.size() == beforeCount + 1);
    const auto& last = mqtt.published.back();
    assert(last.payload.find(key64) != std::string::npos);
    assert(last.payload.find(key65) == std::string::npos);
  }
  std::cout << "✅ PASSED\n";

  // --------------------------------------------------------------------------
  // TEST 11: High-Frequency Telemetry Ingestion Burst (1,000 Writes)
  // --------------------------------------------------------------------------
  std::cout << "▶ [Test 11] High-frequency telemetry burst (1,000 writes)... ";
  {
    PubSubClient& mqtt = Raina.getMqttClient();
    size_t beforeCount = mqtt.published.size();

    for (int i = 0; i < 1000; i++) {
      if (i % 4 == 0) Raina.send("metric_bool", (i % 2 == 0));
      else if (i % 4 == 1) Raina.send("metric_int", i);
      else if (i % 4 == 2) Raina.send("metric_float", (float)i * 0.1f);
      else Raina.send("metric_str", "stable_payload");
    }

    // Flush all 1,000 aggregated updates
    Raina.run();
    assert(mqtt.published.size() == beforeCount + 1);
    const auto& last = mqtt.published.back();
    assert(last.payload.find("\"metric_bool\":") != std::string::npos);
    assert(last.payload.find("\"metric_int\":") != std::string::npos);
    assert(last.payload.find("\"metric_str\":\"stable_payload\"") != std::string::npos);
  }
  std::cout << "✅ PASSED\n";

  // --------------------------------------------------------------------------
  // TEST 12: Offline Telemetry Staging & Zero Data Loss Reconnect
  // --------------------------------------------------------------------------
  std::cout << "▶ [Test 12] Offline staging & zero-loss reconnection... ";
  {
    PubSubClient& mqtt = Raina.getMqttClient();

    // 1. Simulate network disconnect
    mqtt.disconnect();

    // 2. Queue telemetry while offline
    Raina.send("offline_sensor_1", 10.5);
    Raina.send("offline_sensor_2", 20.5);

    // 3. Flush fails because offline; data remains safely in buffer
    bool flushedWhileOffline = Raina.flush();
    assert(flushedWhileOffline == false);

    // 4. Restore broker connection
    mqtt.connect("esp32_dev01", "proj_farm", "token_123", "status", 1, false, "offline");
    assert(mqtt.connected() == true);

    // 5. Run SDK loop -> should auto-flush staged offline telemetry
    size_t beforeCount = mqtt.published.size();
    Raina.run();

    assert(mqtt.published.size() == beforeCount + 1);
    const auto& last = mqtt.published.back();
    assert(last.payload.find("\"offline_sensor_1\":10.5") != std::string::npos);
    assert(last.payload.find("\"offline_sensor_2\":20.5") != std::string::npos);
  }
  std::cout << "✅ PASSED\n";

  // --------------------------------------------------------------------------
  // TEST 13: Multi-Actuator Composite Command Envelopes
  // --------------------------------------------------------------------------
  std::cout << "▶ [Test 13] Multi-actuator composite command envelopes... ";
  {
    PubSubClient& mqtt = Raina.getMqttClient();
    g_pumpState = false;
    g_fanSpeed = 0;
    g_dynamicRelayState = false;

    // Send 3 distinct actuator commands in a single packet + envelope metadata
    const char* multiPayload =
        "{\"pump_relay\": true, \"fan_speed\": 95, \"dynamic_relay\": true, "
        "\"cmd_id\": \"cmd_batch_001\", \"ts\": 1718000999, \"timestamp\": 1718000999}";
    mqtt.simulateIncoming("v1/proj_farm/devices/esp32_dev01/commands", multiPayload);

    assert(g_pumpState == true);
    assert(g_fanSpeed == 95);
    assert(g_dynamicRelayState == true);
  }
  std::cout << "✅ PASSED\n";

  // --------------------------------------------------------------------------
  // TEST 14: Color Fuzzing, Out-of-Bounds HSV & Bit-Depth Math
  // --------------------------------------------------------------------------
  std::cout << "▶ [Test 14] Color fuzzing & out-of-bounds math... ";
  {
    // 1. Hex with leading/trailing whitespaces
    RainaColor cSpace = RainaColor::fromHex("  #123456 \r\n ");
    assert(cSpace.r == 0x12 && cSpace.g == 0x34 && cSpace.b == 0x56);

    // 2. 3-digit shorthand
    RainaColor cShort = RainaColor::fromHex("#A50");
    assert(cShort.r == 0xAA && cShort.g == 0x55 && cShort.b == 0x00);

    // 3. Hue > 360 wraps around (720 deg = 0 deg Pure Red)
    RainaColor h720 = RainaColor::fromHsv(720, 100, 100);
    assert(h720.r == 255 && h720.g == 0 && h720.b == 0);

    // 4. Negative Hue wraps (-120 deg = 240 deg Pure Blue)
    RainaColor hNeg = RainaColor::fromHsv(-120, 100, 100);
    assert(hNeg.r == 0 && hNeg.g == 0 && hNeg.b == 255);

    // 5. RGB565 boundaries
    RainaColor white(255, 255, 255);
    assert(white.toRgb565() == 0xFFFF);
    RainaColor black(0, 0, 0);
    assert(black.toRgb565() == 0x0000);
  }
  std::cout << "✅ PASSED\n";

  // --------------------------------------------------------------------------
  // TEST 15: Lifecycle Callbacks & Non-Blocking Loop Stress (10,000 calls)
  // --------------------------------------------------------------------------
  std::cout << "▶ [Test 15] Lifecycle callbacks & loop stress (10,000 cycles)... ";
  {
    g_onConnectFired = false;
    g_onDisconnectFired = false;

    Raina.onConnect([]() { g_onConnectFired = true; });
    Raina.onDisconnect([]() { g_onDisconnectFired = true; });

    PubSubClient& mqtt = Raina.getMqttClient();

    // Trigger disconnect event
    mqtt.disconnect();
    Raina.run();
    assert(g_onDisconnectFired == true);

    // Tight loop stress test (10,000 cycles) - verifies non-blocking speed & zero deadlocks
    for (int i = 0; i < 10000; i++) {
      Raina.run();
    }
  }
  std::cout << "✅ PASSED\n";

  // --------------------------------------------------------------------------
  // TEST 16: Comprehensive RainaValue Type-Safe Fallbacks
  // --------------------------------------------------------------------------
  std::cout << "▶ [Test 16] Type-safe fallbacks for ambiguous variants... ";
  {
    // Positive booleans
    const char* truthyStrings[] = {"true", "TRUE", "yes", "YES", "on", "ON", "1"};
    for (const char* str : truthyStrings) {
      JsonVariantConst v(str);
      RainaValue val(v);
      assert(val.asBool() == true);
    }

    // Negative booleans
    const char* falsyStrings[] = {"false", "FALSE", "no", "NO", "off", "OFF", "0", "invalid_text"};
    for (const char* str : falsyStrings) {
      JsonVariantConst v(str);
      RainaValue val(v);
      assert(val.asBool() == false);
    }

    // Floating point string with spaces
    JsonVariantConst vFloat(" -98.76 ");
    RainaValue valFloat(vFloat);
    assert(valFloat.asInt() == -98);
    assert(std::abs(valFloat.asFloat() - (-98.76f)) < 0.01f);

    // Null variant
    JsonVariantConst vNull;
    RainaValue valNull(vNull);
    assert(valNull.isNull() == true);
    assert(valNull.asBool() == false);
    assert(valNull.asInt() == 0);
    assert(valNull.asString() == "");
  }
  std::cout << "✅ PASSED\n";

  std::cout << "==================================================\n";
  std::cout << "🎉 ALL 16 RAINA ARDUINO UNIT TESTS PASSED (100%)\n";
  std::cout << "==================================================\n";

  return 0;
}
