import mqtt from "mqtt";

const BROKER_URL = process.env.EMQX_BROKER_URL || "mqtt://localhost:1883";
const PROJECT_ID = process.env.PROJECT_ID;
const PROJECT_TOKEN = process.env.PROJECT_TOKEN;
const DEVICE_ID = process.env.DEVICE_ID;
const INTERVAL_MS = Number(process.env.INTERVAL_MS) || 3000;

if (!PROJECT_ID || !PROJECT_TOKEN || !DEVICE_ID) {
  console.error("Set PROJECT_ID, PROJECT_TOKEN, and DEVICE_ID before starting the emulator.");
  process.exit(1);
}

// Internal state of the emulated ESP32 device
const state = {
  temperature: 28.5,
  humidity: 65.0,
  soil_moisture: 58.0,
  soil_ec: 1.45,
  soil_ph: 6.5,
  pump_relay: 0,
  fan_speed: 75,
};

console.log("==================================================");
console.log("🌱 raina IoT Hardware Emulator (ESP32)");
console.log(`Connecting to MQTT Broker: ${BROKER_URL}`);
console.log(`Project: ${PROJECT_ID} | Device: ${DEVICE_ID}`);
console.log(`Auth Token: ${PROJECT_TOKEN ? `${PROJECT_TOKEN.slice(0, 10)}...` : "(none)"}`);
console.log("==================================================");

const client = mqtt.connect(BROKER_URL, {
  clientId: process.env.CLIENT_ID || DEVICE_ID,
  username: PROJECT_ID,
  password: PROJECT_TOKEN,
  clean: true,
  will: {
    topic: `projects/${PROJECT_ID}/devices/${DEVICE_ID}/status`,
    payload: Buffer.from(JSON.stringify({ status: "offline", ts: Date.now() })),
    qos: 1,
    retain: false,
  },
});

client.on("error", (err) => {
  console.error("❌ [MQTT ERROR] Connection failed:", err.message);
  if (err.message.includes("Not authorized") || err.message.includes("Connection refused")) {
    console.error("🔒 Authentication rejected by EMQX! Check if PROJECT_TOKEN is valid and unrevoked.");
  }
});

client.on("connect", () => {
  console.log("✅ [MQTT] Successfully connected to EMQX Broker!");

  // Publish online status
  const statusTopic = `projects/${PROJECT_ID}/devices/${DEVICE_ID}/status`;
  client.publish(statusTopic, JSON.stringify({ status: "online", ts: Date.now() }));
  console.log(`📡 [STATUS] Published ONLINE state to ${statusTopic}`);

  // Subscribe to control topics for actuators
  const topicsToSubscribe = [
    `v1/${PROJECT_ID}/devices/${DEVICE_ID}/commands`,
    `projects/${PROJECT_ID}/devices/${DEVICE_ID}/control`,
  ];

  topicsToSubscribe.forEach((t) => {
    client.subscribe(t, (err) => {
      if (!err) {
        console.log(`👂 [LISTEN] Subscribed to actuator commands: ${t}`);
      }
    });
  });

  console.log(`\n🚀 Telemetry emulation running (Publishing every ${INTERVAL_MS / 1000}s)...`);
  console.log("👉 Open Web Dashboard at http://localhost:3000 to observe real-time updates!\n");

  startSimulationLoop();
});

client.on("message", (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    console.log(`\n⚡ [ACTUATOR COMMAND RECEIVED] Topic: ${topic}`);
    console.log("   Payload:", JSON.stringify(payload, null, 2));

    if (payload.variable || payload.key) {
      const key = payload.variable || payload.key;
      const val = payload.value;
      (state as any)[key] = val;
      console.log(`   👉 Updated actuator state: ${key} = ${val}`);
    }
  } catch (err) {
    console.error("   ❌ Failed to parse incoming command:", err);
  }
});

client.on("error", (err) => {
  console.error("❌ [MQTT Error]:", err.message);
});

function randomWalk(current: number, min: number, max: number, maxStep: number): number {
  const step = (Math.random() * 2 - 1) * maxStep;
  const next = current + step;
  return Math.min(Math.max(Number(next.toFixed(1)), min), max);
}

let simStep = 0;

function startSimulationLoop() {
  setInterval(() => {
    simStep++;
    // Base environmental sine wave cycle (simulating day/night or ventilation cycles)
    const wave = Math.sin((simStep * 0.1));

    // Responsive physics based on actuator states:
    // When pump/chiller is ON (1): cool down, increase humidity
    // When fan_speed is high: rapid circulation
    const chillerActive = Number(state.pump_relay) > 0;
    const fanEffect = (Number(state.fan_speed) || 50) / 100;

    const targetTemp = chillerActive ? (18.0 + wave * 2.0) : (28.0 + wave * 4.0);
    const targetHumid = chillerActive ? (75.0 + wave * 5.0) : (55.0 - wave * 10.0);
    const targetSoilMoist = chillerActive ? (65.0 + wave * 3.0) : (52.0 - wave * 4.0);

    // Smooth convergence towards target with organic noise
    state.temperature = Number((state.temperature + (targetTemp - state.temperature) * 0.15 + (Math.random() * 0.6 - 0.3)).toFixed(1));
    state.humidity = Number((state.humidity + (targetHumid - state.humidity) * 0.15 + (Math.random() * 1.0 - 0.5)).toFixed(1));
    state.soil_moisture = Number((state.soil_moisture + (targetSoilMoist - state.soil_moisture) * 0.1 + (Math.random() * 0.4 - 0.2)).toFixed(1));
    state.soil_ec = Number((1.45 + wave * 0.15 + (Math.random() * 0.04 - 0.02)).toFixed(2));
    state.soil_ph = Number((6.6 + wave * 0.2 + (Math.random() * 0.04 - 0.02)).toFixed(2));

    const telemetryPayload = {
      ts: Date.now(),
      temperature: state.temperature,
      humidity: state.humidity,
      soil_moisture: state.soil_moisture,
      soil_ec: state.soil_ec,
      soil_ph: state.soil_ph,
    };

    const telemetryTopic = `projects/${PROJECT_ID}/devices/${DEVICE_ID}/telemetry`;

    client.publish(telemetryTopic, JSON.stringify(telemetryPayload), { qos: 0 }, (err) => {
      if (err) {
        console.error("❌ Failed to publish telemetry:", err);
      } else {
        const timeStr = new Date().toLocaleTimeString();
        console.log(
          `[${timeStr}] 📤 Telemetry sent -> 🌡️ ${state.temperature}°C | 💧 ${state.humidity}% | 🌱 Moisture: ${state.soil_moisture}% | ⚡ EC: ${state.soil_ec} | 🧪 pH: ${state.soil_ph}`
        );
      }
    });
  }, INTERVAL_MS);
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Stopping emulator...");
  const statusTopic = `projects/${PROJECT_ID}/devices/${DEVICE_ID}/status`;
  client.publish(statusTopic, JSON.stringify({ status: "offline", ts: Date.now() }), () => {
    console.log("🔴 Device marked OFFLINE. Disconnecting MQTT...");
    client.end(false, () => {
      console.log("👋 Bye!");
      process.exit(0);
    });
  });
});
