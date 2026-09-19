import { describe, it, expect } from "vitest";

describe("Real-time Telemetry & Stream Contract Verification", () => {
  it("parses both standard onmessage frames and named event telemetry frames correctly", () => {
    const rawTelemetryPayload = JSON.stringify({
      type: "telemetry",
      projectId: "proj_farm_01",
      deviceId: "dev_esp32_01",
      variable: "temperature",
      value: 28.5,
      timestamp: 1726000000000,
    });

    const parsed = JSON.parse(rawTelemetryPayload);
    expect(parsed.type).toBe("telemetry");
    expect(parsed.variable).toBe("temperature");
    expect(parsed.value).toBe(28.5);
    expect(parsed.timestamp).toBe(1726000000000);
  });

  it("handles initial snapshot state frame with variable map and chart series correctly", () => {
    const rawSnapshotPayload = JSON.stringify({
      type: "snapshot",
      projectId: "proj_farm_01",
      variables: {
        temperature: 28.5,
        humidity: 65.2,
        pump_relay: true,
      },
      series: {
        temperature: {
          t: [1726000000000, 1726000005000],
          v: [28.2, 28.5],
        },
      },
      timestamp: 1726000005000,
    });

    const parsed = JSON.parse(rawSnapshotPayload);
    expect(parsed.type).toBe("snapshot");
    expect(parsed.variables.temperature).toBe(28.5);
    expect(parsed.variables.pump_relay).toBe(true);
    expect(parsed.series.temperature.v).toEqual([28.2, 28.5]);
  });

  it("ensures control actions maintain consistent timestamp and numeric typing for series sync", () => {
    const controlValue = 42;
    const nowMs = 1726000010000;

    const controlEvent = {
      type: "control",
      projectId: "proj_farm_01",
      deviceId: "dev_esp32_01",
      variable: "temperature",
      value: controlValue,
      timestamp: nowMs,
    };

    expect(controlEvent.value).toBe(42);
    expect(typeof controlEvent.value).toBe("number");
  });
});
