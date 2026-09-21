import { createConnection } from "node:net";
import { connect as connectTls, type TLSSocket } from "node:tls";
import { readFileSync } from "node:fs";
import type { Socket } from "node:net";

const RLP_URL = process.env.RLP_URL ?? "rlp://127.0.0.1:9000";
const PROJECT_TOKEN = process.env.PROJECT_TOKEN;
const DEVICE_ID = process.env.DEVICE_ID;
const INTERVAL_MS = Number(process.env.INTERVAL_MS) || 3000;
const insecure = process.env.RLP_INSECURE === "true";
const ca = process.env.RLP_CA_FILE ? readFileSync(process.env.RLP_CA_FILE) : undefined;

if (!PROJECT_TOKEN || !DEVICE_ID) {
  console.error("Set PROJECT_TOKEN and DEVICE_ID before starting the RLP emulator.");
  process.exit(1);
}

const endpoint = new URL(RLP_URL);
if (endpoint.protocol !== "rlp:" && endpoint.protocol !== "rlps:") {
  throw new Error("RLP_URL must use rlp:// or rlps://");
}
if (endpoint.protocol === "rlps:" && !ca && !insecure) {
  throw new Error("Secure RLP requires RLP_CA_FILE, or RLP_INSECURE=true for local development only.");
}

enum PacketType { HELLO = 1, WELCOME = 2, DATA = 3, BATCH = 4, COMMAND = 5, ACK = 6, PING = 7, PONG = 8, ERROR = 9, DISCONNECT = 10 }
enum ValueType { BOOL = 1, INT32 = 6, UINT16 = 5, FLOAT64 = 11, STRING = 12 }

const channels = {
  temperature: 1,
  humidity: 2,
  soil_moisture: 3,
  soil_ec: 4,
  soil_ph: 5,
  pump_relay: 6,
  fan_speed: 7,
} as const;
const channelNames = new Map<number, string>(Object.entries(channels).map(([key, channel]) => [channel, key]));

const state: Record<keyof typeof channels, number | boolean> = {
  temperature: 28.5, humidity: 65, soil_moisture: 58, soil_ec: 1.45, soil_ph: 6.5, pump_relay: false, fan_speed: 75,
};

let socket: Socket | TLSSocket | undefined;
let retained = Buffer.alloc(0);
let welcomed = false;
let telemetryTimer: NodeJS.Timeout | undefined;
let pingTimer: NodeJS.Timeout | undefined;
let reconnectTimer: NodeJS.Timeout | undefined;
let stopping = false;
let simStep = 0;

function frame(type: PacketType, payload = Buffer.alloc(0)) {
  if (payload.length > 0xffff) throw new Error("RLP frame is too large");
  const header = Buffer.allocUnsafe(4);
  header[0] = type; header[1] = 0; header.writeUInt16BE(payload.length, 2);
  return Buffer.concat([header, payload]);
}

function lp8(value: string) { const bytes = Buffer.from(value); if (bytes.length > 255) throw new Error("device ID too long"); return Buffer.concat([Buffer.from([bytes.length]), bytes]); }
function lp16(value: Buffer) { const length = Buffer.allocUnsafe(2); length.writeUInt16BE(value.length); return Buffer.concat([length, value]); }

function encodeValue(type: ValueType, value: number | boolean | string) {
  switch (type) {
    case ValueType.BOOL: return Buffer.from([value ? 1 : 0]);
    case ValueType.UINT16: { const b = Buffer.allocUnsafe(2); b.writeUInt16BE(Number(value)); return b; }
    case ValueType.INT32: { const b = Buffer.allocUnsafe(4); b.writeInt32BE(Number(value)); return b; }
    case ValueType.FLOAT64: { const b = Buffer.allocUnsafe(8); b.writeDoubleBE(Number(value)); return b; }
    case ValueType.STRING: return lp16(Buffer.from(String(value), "utf8"));
  }
}

function write(packet: Buffer) {
  if (!socket || socket.destroyed || !welcomed) return false;
  return socket.write(packet);
}

function hello() {
  const capabilities = Buffer.from(JSON.stringify({ raina: { channels } }), "utf8");
  const payload = Buffer.concat([Buffer.from([1]), lp8(DEVICE_ID!), lp16(Buffer.from(PROJECT_TOKEN!, "utf8")), lp16(capabilities)]);
  socket?.write(frame(PacketType.HELLO, payload));
}

function sendAck(id: number, status: number) {
  const payload = Buffer.allocUnsafe(5);
  payload.writeUInt32BE(id, 0); payload[4] = status;
  write(frame(PacketType.ACK, payload));
}

function telemetry() {
  if (!welcomed) return;
  simStep++;
  const wave = Math.sin(simStep * 0.1);
  const chilled = Boolean(state.pump_relay);
  const targetTemp = chilled ? 18 + wave * 2 : 28 + wave * 4;
  const targetHumidity = chilled ? 75 + wave * 5 : 55 - wave * 10;
  const targetMoisture = chilled ? 65 + wave * 3 : 52 - wave * 4;
  const walk = (current: number, target: number, amount: number) => Number((current + (target - current) * amount + (Math.random() - .5) * amount * 4).toFixed(1));
  state.temperature = walk(Number(state.temperature), targetTemp, .15);
  state.humidity = walk(Number(state.humidity), targetHumidity, .15);
  state.soil_moisture = walk(Number(state.soil_moisture), targetMoisture, .1);
  state.soil_ec = Number((1.45 + wave * .15 + (Math.random() - .5) * .04).toFixed(2));
  state.soil_ph = Number((6.6 + wave * .2 + (Math.random() - .5) * .04).toFixed(2));
  const values = ["temperature", "humidity", "soil_moisture", "soil_ec", "soil_ph"] as const;
  const records = values.map((name) => Buffer.concat([Buffer.from([0]), (() => { const b = Buffer.allocUnsafe(2); b.writeUInt16BE(channels[name]); return b; })(), Buffer.from([ValueType.FLOAT64]), encodeValue(ValueType.FLOAT64, state[name]) ]));
  const count = Buffer.allocUnsafe(2); count.writeUInt16BE(records.length);
  write(frame(PacketType.BATCH, Buffer.concat([count, ...records])));
  console.log(`[${new Date().toLocaleTimeString()}] telemetry: ${state.temperature}°C, ${state.humidity}%, moisture ${state.soil_moisture}%`);
}

function handle(type: number, payload: Buffer) {
  if (type === PacketType.WELCOME) {
    if (payload.length < 3 || payload[0] !== 1) throw new Error("RLP server rejected protocol version");
    welcomed = true;
    console.log("Connected to RLP gateway; telemetry and control are active.");
    telemetry();
    telemetryTimer = setInterval(telemetry, INTERVAL_MS);
    pingTimer = setInterval(() => { const nonce = Buffer.allocUnsafe(4); nonce.writeUInt32BE(Date.now() >>> 0); write(frame(PacketType.PING, nonce)); }, 30_000);
    return;
  }
  if (type === PacketType.PING && payload.length === 4) { write(frame(PacketType.PONG, Buffer.from(payload))); return; }
  if (type !== PacketType.COMMAND || payload.length < 7) return;
  const id = payload.readUInt32BE(0); const channel = payload.readUInt16BE(4); const typeId = payload[6]; const data = payload.subarray(7);
  const name = channelNames.get(channel) as keyof typeof channels | undefined;
  if (!name) return sendAck(id, 2);
  try {
    let value: number | boolean | string;
    if (typeId === ValueType.BOOL && data.length === 1 && data[0] <= 1) value = data[0] === 1;
    else if (typeId === ValueType.UINT16 && data.length === 2) value = data.readUInt16BE();
    else if (typeId === ValueType.INT32 && data.length === 4) value = data.readInt32BE();
    else if (typeId === ValueType.FLOAT64 && data.length === 8) value = data.readDoubleBE();
    else if (typeId === ValueType.STRING && data.length >= 2 && data.readUInt16BE() === data.length - 2) value = data.subarray(2).toString("utf8");
    else return sendAck(id, 1);
    state[name] = value as never;
    console.log(`command: ${name} = ${value}`);
    sendAck(id, 0);
  } catch { sendAck(id, 3); }
}

function processFrames(chunk: Buffer) {
  retained = Buffer.concat([retained, chunk]);
  while (retained.length >= 4) {
    const size = retained.readUInt16BE(2);
    if (size > 16 * 1024) throw new Error("server sent an oversized RLP frame");
    if (retained.length < size + 4) return;
    const type = retained[0]; const payload = retained.subarray(4, size + 4);
    retained = retained.subarray(size + 4);
    handle(type, payload);
  }
}

function clearTimers() { if (telemetryTimer) clearInterval(telemetryTimer); if (pingTimer) clearInterval(pingTimer); telemetryTimer = undefined; pingTimer = undefined; }
function scheduleReconnect() { if (stopping || reconnectTimer) return; reconnectTimer = setTimeout(() => { reconnectTimer = undefined; connect(); }, 3000); }

function connect() {
  welcomed = false; retained = Buffer.alloc(0); clearTimers();
  console.log(`Connecting to ${endpoint.protocol === "rlps:" ? "secure " : ""}RLP gateway ${endpoint.host} as ${DEVICE_ID}…`);
  socket = endpoint.protocol === "rlps:"
    ? connectTls({ host: endpoint.hostname, port: Number(endpoint.port || 8883), servername: endpoint.hostname, ca, rejectUnauthorized: !insecure })
    : createConnection({ host: endpoint.hostname, port: Number(endpoint.port || 9000) });
  socket.once("connect", hello);
  socket.on("data", (chunk) => { try { processFrames(chunk); } catch (error) { console.error("RLP protocol error:", error instanceof Error ? error.message : error); socket?.destroy(); } });
  socket.on("error", (error) => console.error("RLP connection error:", error.message));
  socket.on("close", () => { welcomed = false; clearTimers(); if (!stopping) { console.log("RLP connection closed; reconnecting."); scheduleReconnect(); } });
}

console.log("Raina RLP hardware emulator");
console.log(`Endpoint: ${RLP_URL} | Device: ${DEVICE_ID}`);
connect();

process.on("SIGINT", () => {
  stopping = true; clearTimers(); if (reconnectTimer) clearTimeout(reconnectTimer);
  if (socket && !socket.destroyed) { const code = Buffer.from([0, 0]); socket.write(frame(PacketType.DISCONNECT, code), () => socket?.end()); }
  else process.exit(0);
});
