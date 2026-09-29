export default function RlpProtocolDoc() {
  return (
    <article className="max-w-3xl space-y-6">
      <div>
        <span className="text-[10px] font-mono uppercase tracking-widest text-primary font-bold block mb-1">
          Protocol Specification
        </span>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          Raina Link Protocol (RLP v1)
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Binary socket transport specification between microcontrollers and the Raina Gateway.
        </p>
      </div>

      <section className="space-y-2 text-xs text-muted-foreground leading-relaxed">
        <h2 className="text-sm font-bold text-foreground border-b border-border pb-1.5">
          Design Goals
        </h2>
        <p>
          RLP was designed specifically to eliminate the overhead of MQTT and HTTP on low-power IoT controllers (ESP8266, ESP32, STM32, RP2040):
        </p>
        <ul className="list-disc list-inside space-y-1 pl-1">
          <li><strong className="text-foreground">Zero Broker Overhead</strong>: Connects directly via persistent TCP/TLS stream.</li>
          <li><strong className="text-foreground">Numeric Channel Mapping</strong>: Variable names are mapped to 16-bit numeric channels in the initial HELLO handshake. Subsequent telemetry transmissions use only 2 bytes per variable.</li>
          <li><strong className="text-foreground">Zero Dynamic JSON Allocations</strong>: Packets are encoded in raw binary format, eliminating heap fragmentation.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-foreground border-b border-border pb-1.5">
          1. Network Ports
        </h2>
        <div className="overflow-x-auto rounded-sm border border-border bg-card">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted text-foreground border-b border-border">
              <tr>
                <th className="p-2.5 font-bold font-mono">Port</th>
                <th className="p-2.5 font-bold">Transport</th>
                <th className="p-2.5 font-bold">Target Environment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono text-[11px]">
              <tr>
                <td className="p-2.5 text-primary font-bold">9000</td>
                <td className="p-2.5 text-foreground font-sans">Raw TCP (Plaintext)</td>
                <td className="p-2.5 font-sans text-muted-foreground">Local development, LAN, or VPN-secured microcontrollers</td>
              </tr>
              <tr>
                <td className="p-2.5 text-primary font-bold">8883</td>
                <td className="p-2.5 text-foreground font-sans">TLS 1.2 / 1.3</td>
                <td className="p-2.5 font-sans text-muted-foreground">Production internet deployments with CA verification</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-foreground border-b border-border pb-1.5">
          2. Frame Header Format (4 Bytes)
        </h2>
        <p className="text-xs text-muted-foreground">Every packet begins with a standard 4-byte header:</p>
        <div className="p-3 rounded-xs bg-slate-900 border border-slate-800 font-mono text-xs text-slate-100 overflow-x-auto">
          +-------------+-------------+---------------------------+<br />
          | Type (1B)   | Flags (1B)  | Length (2B, Big-Endian)   |  Header (4 Bytes)<br />
          +-------------+-------------+---------------------------+<br />
          | Payload (0 to 65535 Bytes)                            |<br />
          +-------------------------------------------------------+
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-foreground border-b border-border pb-1.5">
          3. Packet Types
        </h2>
        <div className="overflow-x-auto rounded-sm border border-border bg-card">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted text-foreground border-b border-border">
              <tr>
                <th className="p-2.5 font-bold font-mono">Opcode</th>
                <th className="p-2.5 font-bold">Name</th>
                <th className="p-2.5 font-bold">Sender</th>
                <th className="p-2.5 font-bold">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-[11px]">
              <tr>
                <td className="p-2.5 text-primary font-mono font-bold">0x01</td>
                <td className="p-2.5 font-mono font-bold text-foreground">HELLO</td>
                <td className="p-2.5 text-muted-foreground">Device</td>
                <td className="p-2.5 text-muted-foreground">Initial authentication with deviceId, token, and channel map.</td>
              </tr>
              <tr>
                <td className="p-2.5 text-primary font-mono font-bold">0x02</td>
                <td className="p-2.5 font-mono font-bold text-foreground">WELCOME</td>
                <td className="p-2.5 text-muted-foreground">Server</td>
                <td className="p-2.5 text-muted-foreground">Authentication accepted; acknowledges device session.</td>
              </tr>
              <tr>
                <td className="p-2.5 text-primary font-mono font-bold">0x03</td>
                <td className="p-2.5 font-mono font-bold text-foreground">DATA</td>
                <td className="p-2.5 text-muted-foreground">Device</td>
                <td className="p-2.5 text-muted-foreground">Single metric telemetry update.</td>
              </tr>
              <tr>
                <td className="p-2.5 text-primary font-mono font-bold">0x04</td>
                <td className="p-2.5 font-mono font-bold text-foreground">BATCH</td>
                <td className="p-2.5 text-muted-foreground">Device</td>
                <td className="p-2.5 text-muted-foreground">Multi-metric batch update sent in a single atomic transmission.</td>
              </tr>
              <tr>
                <td className="p-2.5 text-primary font-mono font-bold">0x05</td>
                <td className="p-2.5 font-mono font-bold text-foreground">COMMAND</td>
                <td className="p-2.5 text-muted-foreground">Server</td>
                <td className="p-2.5 text-muted-foreground">Downlink actuator command to device with unique 32-bit Command ID.</td>
              </tr>
              <tr>
                <td className="p-2.5 text-primary font-mono font-bold">0x06</td>
                <td className="p-2.5 font-mono font-bold text-foreground">ACK</td>
                <td className="p-2.5 text-muted-foreground">Device</td>
                <td className="p-2.5 text-muted-foreground">Confirmation acknowledging COMMAND execution.</td>
              </tr>
              <tr>
                <td className="p-2.5 text-primary font-mono font-bold">0x07</td>
                <td className="p-2.5 font-mono font-bold text-foreground">PING</td>
                <td className="p-2.5 text-muted-foreground">Both</td>
                <td className="p-2.5 text-muted-foreground">Heartbeat liveness check with nonce.</td>
              </tr>
              <tr>
                <td className="p-2.5 text-primary font-mono font-bold">0x08</td>
                <td className="p-2.5 font-mono font-bold text-foreground">PONG</td>
                <td className="p-2.5 text-muted-foreground">Both</td>
                <td className="p-2.5 text-muted-foreground">Heartbeat reply mirroring PING nonce.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </article>
  );
}
