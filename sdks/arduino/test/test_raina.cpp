#include "mock_arduino.h"
#include "Raina.h"

#include <cassert>
#include <iostream>
#include <cmath>

static bool relayValue = false;
static int speedValue = 0;
static float targetTempValue = 0.0f;
static std::string statusMessage = "";
static RainaColor ledColor;

RAINA_ON("pump_relay") {
  relayValue = value.asBool();
}

RAINA_ON("fan_speed") {
  speedValue = value.asInt();
}

RAINA_ON("target_temp") {
  targetTempValue = value.asFloat();
}

RAINA_ON("device_status") {
  statusMessage = value.asString().c_str();
}

RAINA_ON("rgb_led") {
  ledColor = value.asColor();
}

static std::vector<uint8_t> frame(uint8_t type, const std::vector<uint8_t>& payload) {
  std::vector<uint8_t> result = {type, 0, (uint8_t)(payload.size() >> 8), (uint8_t)payload.size()};
  result.insert(result.end(), payload.begin(), payload.end());
  return result;
}

static bool hasFrame(const std::vector<uint8_t>& stream, uint8_t wanted) {
  for (size_t offset = 0; offset + 4 <= stream.size();) {
    const size_t length = ((size_t)stream[offset + 2] << 8) | stream[offset + 3];
    if (offset + 4 + length > stream.size()) return false;
    if (stream[offset] == wanted) return true;
    offset += 4 + length;
  }
  return false;
}

static std::string helloCapabilities(const std::vector<uint8_t>& stream) {
  for (size_t offset = 0; offset + 4 <= stream.size();) {
    const size_t length = ((size_t)stream[offset + 2] << 8) | stream[offset + 3];
    if (offset + 4 + length > stream.size()) return "";
    if (stream[offset] == 1) {
      const size_t body = offset + 4;
      const size_t deviceLength = stream[body + 1];
      const size_t tokenOffset = body + 2 + deviceLength;
      const size_t tokenLength = ((size_t)stream[tokenOffset] << 8) | stream[tokenOffset + 1];
      const size_t capOffset = tokenOffset + 2 + tokenLength;
      const size_t capLength = ((size_t)stream[capOffset] << 8) | stream[capOffset + 1];
      return std::string((const char*)&stream[capOffset + 2], capLength);
    }
    offset += 4 + length;
  }
  return "";
}

static void testRainaValue() {
  // Test Boolean
  RainaValue vBoolTrue(true);
  assert(vBoolTrue.asBool() == true);
  assert(vBoolTrue.asInt() == 1);
  assert(vBoolTrue.asFloat() == 1.0f);
  assert(vBoolTrue.asString() == "true");

  RainaValue vBoolFalse(false);
  assert(vBoolFalse.asBool() == false);
  assert(vBoolFalse.asInt() == 0);
  assert(vBoolFalse.asFloat() == 0.0f);
  assert(vBoolFalse.asString() == "false");

  // Test String conversions to bool
  assert(RainaValue("1").asBool() == true);
  assert(RainaValue("true").asBool() == true);
  assert(RainaValue("on").asBool() == true);
  assert(RainaValue("yes").asBool() == true);
  assert(RainaValue("0").asBool() == false);
  assert(RainaValue("false").asBool() == false);
  assert(RainaValue("off").asBool() == false);
  assert(RainaValue("no").asBool() == false);

  // Test Integer
  RainaValue vInt(1234);
  assert(vInt.asInt() == 1234);
  assert(vInt.asLong() == 1234);
  assert(vInt.asFloat() == 1234.0f);
  assert(vInt.asBool() == true);
  assert(vInt.asString() == "1234");

  // Test Double / Float
  RainaValue vDouble(45.75);
  assert(std::fabs(vDouble.asDouble() - 45.75) < 0.001);
  assert(std::fabs(vDouble.asFloat() - 45.75f) < 0.001f);
  assert(vDouble.asInt() == 45);
  assert(vDouble.asBool() == true);

  // Test Color
  RainaValue vColorHex("#FF8000");
  RainaColor c1 = vColorHex.asColor();
  assert(c1.r == 0xFF && c1.g == 0x80 && c1.b == 0x00);
  assert(c1.toRgb24() == 0xFF8000);

  RainaValue vColorInt((long)0x00FF00);
  RainaColor c2 = vColorInt.asColor();
  assert(c2.r == 0x00 && c2.g == 0xFF && c2.b == 0x00);

  // Test Null / None
  RainaValue vNull;
  assert(vNull.isNull() == true);
  assert(vNull.asBool() == false);
  assert(vNull.asInt() == 0);
  assert(vNull.asString() == "");
}

int main() {
  testRainaValue();

  // Setup channel mappings
  Raina.setChannel("pump_relay", 7);
  Raina.setChannel("fan_speed", 8);
  Raina.setChannel("target_temp", 9);
  Raina.setChannel("device_status", 10);
  Raina.setChannel("rgb_led", 11);
  Raina.setChannel("humidity", 12);

  Raina.send("temperature", 28.5);
  Raina.begin("127.0.0.1", "legacy-project-id", "test-token", "test-device", 9000);
  Raina.run();

  Client& socket = Raina.getTransportClient();
  assert(socket.connected());
  assert(hasFrame(socket.written, 1)); // HELLO frame
  const std::string capabilities = helloCapabilities(socket.written);
  assert(capabilities.find("temperature") != std::string::npos);
  assert(capabilities.find("pump_relay") != std::string::npos);
  assert(capabilities.find("\"pump_relay\":7") != std::string::npos);
  assert(capabilities.find("\"fan_speed\":8") != std::string::npos);
  assert(capabilities.find("\"target_temp\":9") != std::string::npos);

  // Inject WELCOME frame from server
  socket.inject(frame(2, {1, 0, 0})); // WELCOME v1, empty server capabilities
  Raina.run();
  assert(Raina.connected());
  assert(hasFrame(socket.written, 4)); // Telemetry BATCH frame sent on connect

  // Test 1: Inbound COMMAND BOOL
  // COMMAND id=42, channel=7, RLP_BOOL (1), value=1
  socket.inject(frame(5, {0, 0, 0, 42, 0, 7, 1, 1}));
  Raina.run();
  assert(relayValue == true);
  assert(hasFrame(socket.written, 6)); // ACK sent

  // Duplicate command should be ignored without re-triggering logic
  relayValue = false;
  socket.inject(frame(5, {0, 0, 0, 42, 0, 7, 1, 1}));
  Raina.run();
  assert(relayValue == false); // Not triggered again

  // Test 2: Inbound COMMAND UINT16
  // COMMAND id=43, channel=8, RLP_UINT16 (5), value=250 (0x00FA)
  socket.inject(frame(5, {0, 0, 0, 43, 0, 8, 5, 0x00, 0xFA}));
  Raina.run();
  assert(speedValue == 250);

  // Test 3: Inbound COMMAND FLOAT64
  // COMMAND id=44, channel=9, RLP_FLOAT64 (11), value=24.5
  double targetTemp = 24.5;
  uint64_t tempBits = 0;
  memcpy(&tempBits, &targetTemp, sizeof(tempBits));
  std::vector<uint8_t> floatPayload = {0, 0, 0, 44, 0, 9, 11};
  for (int i = 7; i >= 0; --i) floatPayload.push_back((uint8_t)(tempBits >> (i * 8)));
  socket.inject(frame(5, floatPayload));
  Raina.run();
  assert(std::fabs(targetTempValue - 24.5f) < 0.01f);

  // Test 4: Inbound COMMAND STRING
  // COMMAND id=45, channel=10, RLP_STRING (12), len=7, "RUNNING"
  std::vector<uint8_t> strPayload = {0, 0, 0, 45, 0, 10, 12, 0, 7, 'R', 'U', 'N', 'N', 'I', 'N', 'G'};
  socket.inject(frame(5, strPayload));
  Raina.run();
  assert(statusMessage == "RUNNING");

  // Test 5: Outbound Multi-Metric Send
  size_t writtenBefore = socket.written.size();
  Raina.send("temperature", 30.2, "humidity", 55.0, "fan_speed", 100);
  assert(socket.written.size() > writtenBefore);

  // Test 6: Inbound Heartbeat PING -> PONG
  socket.inject(frame(7, {1, 2, 3, 4})); // PING with nonce 0x01020304
  Raina.run();
  assert(hasFrame(socket.written, 8)); // PONG

  // Malformed oversized input closes the socket rather than growing the parser.
  socket.inject({4, 0, 0x20, 0x00});
  Raina.run();
  assert(!socket.connected());

  std::cout << "All Raina RLP (Zero-Dependency) tests passed successfully!" << std::endl;
  return 0;
}
