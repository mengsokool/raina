import { EventEmitter } from "node:events";
import { createServer, type AddressInfo, type Server, type Socket } from "node:net";
import { createServer as createTlsServer, type TlsOptions } from "node:tls";

export const PROTOCOL_VERSION = 1;
export const DEFAULT_MAX_FRAME_SIZE = 16 * 1024;
export const DEFAULT_MAX_QUEUED_BYTES = 128 * 1024;
export const DEFAULT_HANDSHAKE_TIMEOUT_MS = 10_000;
export const DEFAULT_IDLE_TIMEOUT_MS = 90_000;

export enum PacketType { HELLO = 1, WELCOME = 2, DATA = 3, BATCH = 4, COMMAND = 5, ACK = 6, PING = 7, PONG = 8, ERROR = 9, DISCONNECT = 10 }
export enum FrameFlag { HAS_TIMESTAMP = 1 }
export enum ValueType { BOOL = 1, INT8 = 2, UINT8 = 3, INT16 = 4, UINT16 = 5, INT32 = 6, UINT32 = 7, INT64 = 8, UINT64 = 9, FLOAT32 = 10, FLOAT64 = 11, STRING = 12, BYTES = 13 }
export enum ErrorCode { UNSUPPORTED_VERSION = 1, AUTH_FAILED = 2, MALFORMED_FRAME = 3, FRAME_TOO_LARGE = 4, INVALID_PACKET = 5, INVALID_STATE = 6, UNSUPPORTED_TYPE = 7, HANDSHAKE_TIMEOUT = 8, SLOW_PEER = 9, IDLE_TIMEOUT = 10 }
export enum AckStatus { OK = 0, REJECTED = 1, UNSUPPORTED = 2, FAILED = 3 }

export type RlpValue = boolean | number | bigint | string | Buffer;
export type Sample = { channel: number; valueType: ValueType; value: RlpValue; timestamp?: bigint };
export type Command = Sample & { id: number };
export type Hello = { version: number; deviceId: string; credential: Buffer; capabilities: Buffer };
type Frame = { type: PacketType; flags: number; payload: Buffer };
type Packet =
  | { type: PacketType.HELLO; hello: Hello }
  | { type: PacketType.WELCOME; capabilities: Buffer }
  | { type: PacketType.DATA; sample: Sample }
  | { type: PacketType.BATCH; samples: Sample[] }
  | { type: PacketType.COMMAND; command: Command }
  | { type: PacketType.ACK; ack: { id: number; status: AckStatus } }
  | { type: PacketType.PING | PacketType.PONG; nonce: number }
  | { type: PacketType.ERROR; error: { code: ErrorCode; message: string } }
  | { type: PacketType.DISCONNECT; code: ErrorCode };

export class RlpError extends Error {
  constructor(readonly code: ErrorCode, message: string) { super(message); this.name = "RlpError"; }
}

function encodeFrame(type: PacketType, flags: number, payload: Buffer) {
  if (payload.length > 0xffff) throw new RangeError("frame payload exceeds uint16");
  const frame = Buffer.allocUnsafe(4 + payload.length);
  frame[0] = type; frame[1] = flags; frame.writeUInt16BE(payload.length, 2); payload.copy(frame, 4);
  return frame;
}
function lp8(value: string) { const encoded = Buffer.from(value, "utf8"); if (encoded.length > 0xff) throw new RangeError("string exceeds uint8"); return Buffer.concat([Buffer.from([encoded.length]), encoded]); }
function lp16(value: Buffer) { if (value.length > 0xffff) throw new RangeError("value exceeds uint16"); const size = Buffer.allocUnsafe(2); size.writeUInt16BE(value.length); return Buffer.concat([size, value]); }
function encodeValue(type: ValueType, value: RlpValue): Buffer {
  switch (type) {
    case ValueType.BOOL: if (typeof value === "boolean") return Buffer.from([value ? 1 : 0]); break;
    case ValueType.INT8: { const b = Buffer.allocUnsafe(1); b.writeInt8(Number(value)); return b; }
    case ValueType.UINT8: { const b = Buffer.allocUnsafe(1); b.writeUInt8(Number(value)); return b; }
    case ValueType.INT16: { const b = Buffer.allocUnsafe(2); b.writeInt16BE(Number(value)); return b; }
    case ValueType.UINT16: { const b = Buffer.allocUnsafe(2); b.writeUInt16BE(Number(value)); return b; }
    case ValueType.INT32: { const b = Buffer.allocUnsafe(4); b.writeInt32BE(Number(value)); return b; }
    case ValueType.UINT32: { const b = Buffer.allocUnsafe(4); b.writeUInt32BE(Number(value)); return b; }
    case ValueType.INT64: { if (typeof value === "number" || typeof value === "bigint") { const b = Buffer.allocUnsafe(8); b.writeBigInt64BE(BigInt(value)); return b; } break; }
    case ValueType.UINT64: { if (typeof value === "number" || typeof value === "bigint") { const b = Buffer.allocUnsafe(8); b.writeBigUInt64BE(BigInt(value)); return b; } break; }
    case ValueType.FLOAT32: { const b = Buffer.allocUnsafe(4); b.writeFloatBE(Number(value)); return b; }
    case ValueType.FLOAT64: { const b = Buffer.allocUnsafe(8); b.writeDoubleBE(Number(value)); return b; }
    case ValueType.STRING: if (typeof value === "string") return lp16(Buffer.from(value, "utf8")); break;
    case ValueType.BYTES: if (Buffer.isBuffer(value)) return lp16(value); break;
  }
  throw new TypeError("value does not match its RLP type");
}
function encodeSample(sample: Sample, allowTimestamp = true) {
  const timestamp = allowTimestamp && sample.timestamp !== undefined;
  const head = Buffer.allocUnsafe(3 + (timestamp ? 8 : 0));
  head.writeUInt16BE(sample.channel, 0); head[2] = sample.valueType;
  if (timestamp) head.writeBigInt64BE(sample.timestamp!, 3);
  return { flags: timestamp ? FrameFlag.HAS_TIMESTAMP : 0, body: Buffer.concat([head, encodeValue(sample.valueType, sample.value)]) };
}
function encodePacket(packet: Packet): Buffer {
  switch (packet.type) {
    case PacketType.WELCOME: return encodeFrame(packet.type, 0, Buffer.concat([Buffer.from([PROTOCOL_VERSION]), lp16(packet.capabilities)]));
    case PacketType.COMMAND: { const id = Buffer.allocUnsafe(4); id.writeUInt32BE(packet.command.id); const sample = encodeSample(packet.command, false); return encodeFrame(packet.type, 0, Buffer.concat([id, sample.body])); }
    case PacketType.PONG: case PacketType.PING: { const nonce = Buffer.allocUnsafe(4); nonce.writeUInt32BE(packet.nonce); return encodeFrame(packet.type, 0, nonce); }
    case PacketType.ERROR: { const text = Buffer.from(packet.error.message, "utf8").subarray(0, 255); const body = Buffer.allocUnsafe(3 + text.length); body.writeUInt16BE(packet.error.code); body[2] = text.length; text.copy(body, 3); return encodeFrame(packet.type, 0, body); }
    case PacketType.DISCONNECT: { const body = Buffer.allocUnsafe(2); body.writeUInt16BE(packet.code); return encodeFrame(packet.type, 0, body); }
    default: throw new RlpError(ErrorCode.INVALID_PACKET, "server cannot send this packet type");
  }
}

class Reader {
  private offset = 0;
  constructor(private readonly buffer: Buffer) {}
  get left() { return this.buffer.length - this.offset; }
  private need(size: number) { if (size > this.left) throw new RlpError(ErrorCode.INVALID_PACKET, "truncated packet"); }
  u8() { this.need(1); return this.buffer[this.offset++]; }
  u16() { this.need(2); const value = this.buffer.readUInt16BE(this.offset); this.offset += 2; return value; }
  u32() { this.need(4); const value = this.buffer.readUInt32BE(this.offset); this.offset += 4; return value; }
  i64() { this.need(8); const value = this.buffer.readBigInt64BE(this.offset); this.offset += 8; return value; }
  take(size: number) { this.need(size); const value = this.buffer.subarray(this.offset, this.offset + size); this.offset += size; return value; }
  lp8() { return this.take(this.u8()).toString("utf8"); }
  lp16() { return this.take(this.u16()); }
  done() { if (this.left) throw new RlpError(ErrorCode.INVALID_PACKET, "trailing packet bytes"); }
}
function parseValue(reader: Reader, type: ValueType): RlpValue {
  switch (type) {
    case ValueType.BOOL: { const value = reader.u8(); if (value > 1) throw new RlpError(ErrorCode.INVALID_PACKET, "invalid bool"); return value === 1; }
    case ValueType.INT8: return reader.take(1).readInt8(); case ValueType.UINT8: return reader.u8();
    case ValueType.INT16: return reader.take(2).readInt16BE(); case ValueType.UINT16: return reader.u16();
    case ValueType.INT32: return reader.take(4).readInt32BE(); case ValueType.UINT32: return reader.u32();
    case ValueType.INT64: return reader.i64(); case ValueType.UINT64: return reader.take(8).readBigUInt64BE();
    case ValueType.FLOAT32: return reader.take(4).readFloatBE(); case ValueType.FLOAT64: return reader.take(8).readDoubleBE();
    case ValueType.STRING: { const bytes = reader.lp16(); const text = bytes.toString("utf8"); if (!Buffer.from(text, "utf8").equals(bytes)) throw new RlpError(ErrorCode.INVALID_PACKET, "invalid UTF-8"); return text; }
    case ValueType.BYTES: return reader.lp16();
    default: throw new RlpError(ErrorCode.UNSUPPORTED_TYPE, "unsupported value type");
  }
}
function parseSample(reader: Reader, flags: number, timestampsAllowed = true): Sample {
  if (flags & ~FrameFlag.HAS_TIMESTAMP) throw new RlpError(ErrorCode.INVALID_PACKET, "unknown sample flag");
  const channel = reader.u16(); const valueType = reader.u8() as ValueType;
  if (valueType < ValueType.BOOL || valueType > ValueType.BYTES) throw new RlpError(ErrorCode.UNSUPPORTED_TYPE, "unsupported value type");
  const timestamp = flags & FrameFlag.HAS_TIMESTAMP ? (timestampsAllowed ? reader.i64() : (() => { throw new RlpError(ErrorCode.INVALID_PACKET, "timestamp not permitted"); })()) : undefined;
  return { channel, valueType, value: parseValue(reader, valueType), ...(timestamp === undefined ? {} : { timestamp }) };
}
function decodePacket(frame: Frame): Packet {
  const reader = new Reader(frame.payload);
  switch (frame.type) {
    case PacketType.HELLO: { if (frame.flags) throw new RlpError(ErrorCode.INVALID_PACKET, "HELLO flags"); const hello: Hello = { version: reader.u8(), deviceId: reader.lp8(), credential: reader.lp16(), capabilities: reader.lp16() }; reader.done(); return { type: frame.type, hello }; }
    case PacketType.DATA: { const sample = parseSample(reader, frame.flags); reader.done(); return { type: frame.type, sample }; }
    case PacketType.BATCH: { if (frame.flags) throw new RlpError(ErrorCode.INVALID_PACKET, "BATCH flags"); const count = reader.u16(); if (count > 256) throw new RlpError(ErrorCode.INVALID_PACKET, "batch is too large"); const samples: Sample[] = []; for (let i = 0; i < count; i++) samples.push(parseSample(reader, reader.u8())); reader.done(); return { type: frame.type, samples }; }
    case PacketType.ACK: { if (frame.flags) throw new RlpError(ErrorCode.INVALID_PACKET, "ACK flags"); const id = reader.u32(); const status = reader.u8() as AckStatus; if (status < AckStatus.OK || status > AckStatus.FAILED) throw new RlpError(ErrorCode.INVALID_PACKET, "invalid ACK status"); reader.done(); return { type: frame.type, ack: { id, status } }; }
    case PacketType.PING: case PacketType.PONG: { if (frame.flags) throw new RlpError(ErrorCode.INVALID_PACKET, "heartbeat flags"); const nonce = reader.u32(); reader.done(); return { type: frame.type, nonce }; }
    case PacketType.DISCONNECT: { if (frame.flags) throw new RlpError(ErrorCode.INVALID_PACKET, "DISCONNECT flags"); const code = reader.u16() as ErrorCode; reader.done(); return { type: frame.type, code }; }
    case PacketType.ERROR: { if (frame.flags) throw new RlpError(ErrorCode.INVALID_PACKET, "ERROR flags"); const code = reader.u16() as ErrorCode; const message = reader.lp8(); reader.done(); return { type: frame.type, error: { code, message } }; }
    default: throw new RlpError(ErrorCode.INVALID_PACKET, "packet direction invalid");
  }
}

export interface AuthenticationResult { accept: boolean; capabilities?: Buffer; context?: unknown; }
export interface RlpServerOptions {
  authenticate(hello: Hello): Promise<AuthenticationResult> | AuthenticationResult;
  host?: string;
  port?: number;
  tls?: TlsOptions;
  maxFrameSize?: number;
  maxQueuedBytes?: number;
  maxConnections?: number;
  handshakeTimeoutMs?: number;
  idleTimeoutMs?: number;
  maxCredentialBytes?: number;
  maxCapabilitiesBytes?: number;
}
export class RlpConnection extends EventEmitter {
  deviceId?: string;
  context?: unknown;
  private authenticated = false;
  private closedOnce = false;
  private handshakeTimer?: NodeJS.Timeout;
  private queued: Buffer[] = [];
  private queuedBytes = 0;
  private draining = false;
  private receiveChain: Promise<void> = Promise.resolve();
  constructor(readonly socket: Socket, private readonly options: RlpServerOptions) {
    super();
    socket.setNoDelay(true); socket.setKeepAlive(true);
    const idleMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    if (idleMs > 0) socket.setTimeout(idleMs, () => this.fail(ErrorCode.IDLE_TIMEOUT, "idle timeout"));
    socket.on("data", (chunk) => { this.receiveChain = this.receiveChain.then(() => this.receive(chunk)).catch((error) => this.protocolError(error)); });
    socket.on("drain", () => this.flush()); socket.on("close", () => this.closed()); socket.on("error", () => {});
    const handshakeMs = options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;
    if (handshakeMs > 0) this.handshakeTimer = setTimeout(() => this.fail(ErrorCode.HANDSHAKE_TIMEOUT, "handshake timeout"), handshakeMs);
  }
  command(command: Command) { return this.authenticated && this.send({ type: PacketType.COMMAND, command }); }
  close(code = ErrorCode.AUTH_FAILED) { this.fail(code, "connection revoked"); }
  private async receive(chunk: Buffer) {
    for (const frame of this.decodeFrames(chunk)) await this.handle(decodePacket(frame));
  }
  private decodeFrames(chunk: Buffer) {
    const frames: Frame[] = []; let pending = chunk;
    const retained = (this as { retained?: Buffer }).retained;
    if (retained?.length) pending = Buffer.concat([retained, chunk]);
    let offset = 0; const max = this.options.maxFrameSize ?? DEFAULT_MAX_FRAME_SIZE;
    while (pending.length - offset >= 4) {
      const type = pending[offset] as PacketType; const flags = pending[offset + 1]; const size = pending.readUInt16BE(offset + 2);
      if (size > max) throw new RlpError(ErrorCode.FRAME_TOO_LARGE, "frame exceeds maximum size");
      if (pending.length - offset < size + 4) break;
      frames.push({ type, flags, payload: pending.subarray(offset + 4, offset + 4 + size) }); offset += size + 4;
    }
    const rest = pending.subarray(offset);
    if (rest.length > max + 3) throw new RlpError(ErrorCode.FRAME_TOO_LARGE, "buffer exceeds maximum size");
    (this as { retained?: Buffer }).retained = rest.length ? Buffer.from(rest) : undefined;
    return frames;
  }
  private async handle(packet: Packet) {
    if (!this.authenticated) {
      if (packet.type !== PacketType.HELLO) throw new RlpError(ErrorCode.INVALID_STATE, "HELLO required");
      if (packet.hello.version !== PROTOCOL_VERSION) return this.fail(ErrorCode.UNSUPPORTED_VERSION, "unsupported protocol version");
      if (!packet.hello.deviceId || packet.hello.credential.length === 0 || packet.hello.credential.length > (this.options.maxCredentialBytes ?? 1024) || packet.hello.capabilities.length > (this.options.maxCapabilitiesBytes ?? 4096)) return this.fail(ErrorCode.AUTH_FAILED, "invalid credentials");
      const auth = await this.options.authenticate(packet.hello);
      if (!auth.accept) return this.fail(ErrorCode.AUTH_FAILED, "authentication failed");
      this.authenticated = true; this.deviceId = packet.hello.deviceId; this.context = auth.context;
      if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
      this.send({ type: PacketType.WELCOME, capabilities: auth.capabilities ?? Buffer.alloc(0) });
      this.emit("authenticated", this); return;
    }
    if (packet.type === PacketType.HELLO || packet.type === PacketType.WELCOME || packet.type === PacketType.COMMAND) throw new RlpError(ErrorCode.INVALID_STATE, "packet direction invalid");
    if (packet.type === PacketType.PING) this.send({ type: PacketType.PONG, nonce: packet.nonce });
    else if (packet.type === PacketType.DATA) this.emit("data", packet.sample, this);
    else if (packet.type === PacketType.BATCH) this.emit("batch", packet.samples, this);
    else if (packet.type === PacketType.ACK) this.emit("ack", packet.ack, this);
    else if (packet.type === PacketType.DISCONNECT) this.socket.end();
    else if (packet.type === PacketType.ERROR) this.emit("peerError", packet.error, this);
  }
  private send(packet: Packet) {
    if (this.socket.destroyed) return false;
    const frame = encodePacket(packet);
    if (this.draining) return this.enqueue(frame);
    if (!this.socket.write(frame)) { this.draining = true; this.emit("backpressure", this); }
    return true;
  }
  private enqueue(frame: Buffer) {
    const max = this.options.maxQueuedBytes ?? DEFAULT_MAX_QUEUED_BYTES;
    if (this.queuedBytes + frame.length > max) { this.emit("slowPeer", this); this.fail(ErrorCode.SLOW_PEER, "slow peer"); return false; }
    this.queued.push(frame); this.queuedBytes += frame.length; return true;
  }
  private flush() { this.draining = false; while (this.queued.length) { const frame = this.queued.shift()!; this.queuedBytes -= frame.length; if (!this.socket.write(frame)) { this.draining = true; break; } } }
  private protocolError(error: unknown) { const rlpError = error instanceof RlpError ? error : new RlpError(ErrorCode.MALFORMED_FRAME, "malformed frame"); this.fail(rlpError.code, rlpError.message); }
  private fail(code: ErrorCode, message: string) { if (this.socket.destroyed) return; try { this.socket.write(encodePacket({ type: PacketType.ERROR, error: { code, message } })); } finally { this.socket.end(); } }
  private closed() { if (this.closedOnce) return; this.closedOnce = true; if (this.handshakeTimer) clearTimeout(this.handshakeTimer); this.emit("close", this); }
}
export class RlpServer extends EventEmitter {
  private readonly tcp: Server;
  private readonly devices = new Map<string, RlpConnection>();
  private commandId = 0;
  constructor(private readonly options: RlpServerOptions) {
    super();
    this.tcp = options.tls ? createTlsServer(options.tls, (socket) => this.attach(socket)) : createServer((socket) => this.attach(socket));
    this.tcp.maxConnections = options.maxConnections ?? 10_000;
    this.tcp.on("error", (error) => this.emit("serverError", error));
  }
  async listen() { await new Promise<void>((resolve, reject) => this.tcp.listen(this.options.port ?? 9000, this.options.host, resolve).once("error", reject)); return this.tcp.address() as AddressInfo; }
  async close() { for (const connection of this.devices.values()) connection.socket.destroy(); await new Promise<void>((resolve, reject) => this.tcp.close((error) => error ? reject(error) : resolve())); }
  get size() { return this.devices.size; }
  get address() { return this.tcp.address() as AddressInfo | null; }
  command(deviceId: string, sample: Omit<Command, "id">) { const connection = this.devices.get(deviceId); if (!connection) return false; this.commandId = (this.commandId + 1) >>> 0; const command = { id: this.commandId, ...sample }; const accepted = connection.command(command); if (accepted) this.emit("command:sent", { deviceId, command }); return accepted; }
  getConnection(deviceId: string) { return this.devices.get(deviceId); }
  private attach(socket: Socket) {
    const connection = new RlpConnection(socket, this.options);
    connection.on("authenticated", (client: RlpConnection) => { const prior = this.devices.get(client.deviceId!); if (prior && prior !== client) prior.close(ErrorCode.AUTH_FAILED); this.devices.set(client.deviceId!, client); this.emit("device:connect", client); });
    connection.on("data", (sample, client) => this.emit("data", { deviceId: client.deviceId!, sample, connection: client }));
    connection.on("batch", (samples, client) => this.emit("batch", { deviceId: client.deviceId!, samples, connection: client }));
    connection.on("ack", (ack, client) => this.emit("ack", { deviceId: client.deviceId!, ack, connection: client }));
    connection.on("backpressure", (client) => this.emit("backpressure", client)); connection.on("slowPeer", (client) => this.emit("slowPeer", client));
    connection.on("close", (client: RlpConnection) => { if (client.deviceId && this.devices.get(client.deviceId) === client) this.devices.delete(client.deviceId); if (client.deviceId) this.emit("device:disconnect", client); });
  }
}
export function createRlpServer(options: RlpServerOptions) { return new RlpServer(options); }
