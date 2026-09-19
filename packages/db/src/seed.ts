import { prisma } from "./index";
import crypto from "crypto";

function sha256(str: string): string {
  return crypto.createHash("sha256").update(str).digest("hex");
}

async function main() {
  console.log("🌱 Seeding raina PostgreSQL 17 database...");

  const now = BigInt(Date.now());

  // 1. Create Default Owner User
  function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")): string {
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
  }

  const owner = await prisma.user.upsert({
    where: { email: "owner@raina.farm" },
    update: {
      username: "admin",
      role: "owner",
    },
    create: {
      id: "usr_owner_01",
      email: "owner@raina.farm",
      username: "admin",
      name: "Farm Owner",
      role: "owner",
      firstName: "Somchai",
      lastName: "Raina",
      createdAt: now,
      updatedAt: now,
    },
  });

  await prisma.account.upsert({
    where: {
      id: "acc_owner_01",
    },
    update: {},
    create: {
      id: "acc_owner_01",
      accountId: "admin",
      providerId: "credential",
      userId: owner.id,
      password: hashPassword("admin1234"),
      createdAt: now,
      updatedAt: now,
    },
  });

  // 2. Create Default Farm Project
  const project = await prisma.project.upsert({
    where: { id: "proj_farm_01" },
    update: {
      archivedAt: null,
    },
    create: {
      id: "proj_farm_01",
      name: "Smart Farm Greenhouse 1",
      description: "Smart agriculture IoT monitoring & climate control",
      createdBy: owner.id,
      createdAt: now,
      updatedAt: now,
    },
  });

  // 3. Project Member
  await prisma.projectMember.upsert({
    where: {
      userId_projectId: {
        userId: owner.id,
        projectId: project.id,
      },
    },
    update: {},
    create: {
      userId: owner.id,
      projectId: project.id,
      addedAt: now,
      addedBy: owner.id,
    },
  });

  // 4. Hardware Token for Ingestion
  const plainToken = "raina_project_token_farm_01";
  const projectToken = await prisma.projectToken.upsert({
    where: { hash: sha256(plainToken) },
    update: {},
    create: {
      id: "tok_farm_01",
      projectId: project.id,
      name: "ESP32 Hardware Token",
      hash: sha256(plainToken),
      createdBy: owner.id,
      createdAt: now,
    },
  });

  // 5. Default Device
  const device = await prisma.device.upsert({
    where: { id: "dev_default_01" },
    update: {
      tokenId: projectToken.id,
      deviceKey: "dev_default_01",
    },
    create: {
      id: "dev_default_01",
      projectId: project.id,
      tokenId: projectToken.id,
      name: "Default Controller",
      deviceKey: "dev_default_01",
      chip: "ESP32",
      firmwareVersion: "1.0.0",
      isDefault: true,
      firstSeen: now,
      lastSeen: now,
      createdAt: now,
    },
  });

  // 6. Variables (Sensors & Relays)
  const defaultVariables = [
    { key: "temperature", unit: "°C", value: "28.5" },
    { key: "humidity", unit: "%", value: "65.2" },
    { key: "soil_moisture", unit: "%", value: "58.0" },
    { key: "soil_ec", unit: "mS/cm", value: "1.45" },
    { key: "soil_ph", unit: "pH", value: "6.5" },
    { key: "pump_relay", unit: "", value: "0" },
    { key: "fan_speed", unit: "%", value: "75" },
  ];

  for (const v of defaultVariables) {
    await prisma.projectVariable.upsert({
      where: {
        projectId_deviceId_key: {
          projectId: project.id,
          deviceId: device.id,
          key: v.key,
        },
      },
      update: { value: v.value, updatedAt: now },
      create: {
        id: `var_${v.key}`,
        projectId: project.id,
        deviceId: device.id,
        key: v.key,
        unit: v.unit,
        value: v.value,
        createdAt: now,
        updatedAt: now,
        lastSeen: now,
      },
    });
  }

  // 7. Initial Dashboard Layout
  const initialLayout = {
    grid: { columns: 24 },
    items: [
      { id: "w_val_temp", type: "iot-value", x: 0, y: 0, w: 4, h: 2, props: { label: "อุณหภูมิ", variable: "temperature", unit: "°C" } },
      { id: "w_val_humid", type: "iot-value", x: 4, y: 0, w: 4, h: 2, props: { label: "ความชื้นในอากาศ", variable: "humidity", unit: "%" } },
      { id: "w_gauge_soil", type: "iot-gauge", x: 8, y: 0, w: 6, h: 4, props: { label: "ความชื้นในดิน", variable: "soil_moisture", min: 0, max: 100, unit: "%" } },
      { id: "w_toggle_pump", type: "iot-toggle", x: 14, y: 0, w: 4, h: 2, props: { label: "ปั๊มน้ำพ่นหมอก", variable: "pump_relay" } },
      { id: "w_slider_fan", type: "iot-slider", x: 18, y: 0, w: 6, h: 2, props: { label: "สปีดพัดลม", variable: "fan_speed", min: 0, max: 100 } },
      { id: "w_chart_history", type: "iot-chart", x: 0, y: 4, w: 24, h: 6, props: { label: "ประวัติการวัด (ความชื้น & อุณหภูมิ)", variables: ["soil_moisture", "temperature"] } },
    ],
  };

  await prisma.dashboard.upsert({
    where: { id: "dash_farm_main" },
    update: { layout: JSON.stringify(initialLayout), updatedAt: now },
    create: {
      id: "dash_farm_main",
      projectId: project.id,
      name: "Main Greenhouse Dashboard",
      description: "Live environment telemetry and relay control",
      layout: JSON.stringify(initialLayout),
      visibility: "public",
      shareToken: "share_greenhouse_main",
      createdBy: owner.id,
      createdAt: now,
      updatedAt: now,
    },
  });

  const storageLayout = {
    grid: { columns: 24 },
    items: [
      { id: "w_storage_temp", type: "iot-value", x: 0, y: 0, w: 4, h: 2, props: { title: "Storage Temp", variable: "temperature", unit: "°C" } },
      { id: "w_storage_humid", type: "iot-value", x: 4, y: 0, w: 4, h: 2, props: { title: "Humidity", variable: "humidity", unit: "%" } },
      { id: "w_chiller_toggle", type: "iot-toggle", x: 8, y: 0, w: 4, h: 2, props: { title: "Main Chiller", variable: "pump_relay", onValue: "ON", offValue: "OFF" } },
      { id: "w_emergency_vent", type: "iot-push", x: 12, y: 0, w: 4, h: 2, props: { title: "Emergency Exhaust", variable: "pump_relay", label: "HOLD TO PURGE" } },
      { id: "w_blower_slider", type: "iot-slider", x: 16, y: 0, w: 8, h: 2, props: { title: "Airflow Blower Speed", variable: "fan_speed", orientation: "horizontal", min: 0, max: 100, step: 5, unit: "%" } },
      { id: "w_cooling_load_gauge", type: "iot-gauge", x: 0, y: 2, w: 6, h: 4, props: { title: "Cooling Compressor Load", variable: "soil_moisture", min: 0, max: 100 } },
      { id: "w_fan_util_percent", type: "iot-percent", x: 6, y: 2, w: 6, h: 4, props: { title: "Fan Utilization", variable: "fan_speed", min: 0, max: 100, unit: "%", thresholds: [{ value: 0, color: "#22c55e" }, { value: 65, color: "#f59e0b" }, { value: 85, color: "#ef4444" }] } },
      { id: "w_coldroom_color", type: "iot-color", x: 12, y: 2, w: 6, h: 4, props: { title: "Chamber Ambient Light", variable: "fan_speed", format: "hex", brightness: true, hexInput: true, presets: true } },
      { id: "w_coolant_ph_slider", type: "iot-slider", x: 18, y: 2, w: 6, h: 4, props: { title: "Coolant Tank Level", variable: "soil_ph", orientation: "vertical", min: 0, max: 14, step: 0.1, unit: "pH" } },
      { id: "w_climate_chart", type: "iot-chart", x: 0, y: 6, w: 24, h: 6, props: { title: "Storage Climate History (Temperature & Humidity)", window: "1h", chartType: "area", zoom: true, series: [{ variable: "temperature", label: "Temperature (°C)" }, { variable: "humidity", label: "Humidity (%)" }] } }
    ],
    mobile: null
  };

  await prisma.dashboard.upsert({
    where: { id: "dash_farm_storage" },
    update: { layout: JSON.stringify(storageLayout), updatedAt: now },
    create: {
      id: "dash_farm_storage",
      projectId: project.id,
      name: "Cold Storage Dashboard",
      description: "Comprehensive Cold Storage Climate, Chiller & Ventilation Control",
      layout: JSON.stringify(storageLayout),
      visibility: "public",
      shareToken: "share_farm_storage",
      createdBy: owner.id,
      createdAt: now,
      updatedAt: now,
    },
  });

  // 8. Seed Realistic Telemetry History (only if no telemetry exists yet)
  const existingTelemetryCount = await prisma.telemetry.count({ where: { projectId: project.id } });
  if (existingTelemetryCount === 0) {
    console.log("📊 Generating initial 24-hour telemetry history...");
    const pointsCount = 144;
    const intervalMs = 10 * 60 * 1000; // 10 minutes per point = 24 hours
    const startTime = Date.now() - pointsCount * intervalMs;
    const telemetryRecords: Array<{
      projectId: string;
      deviceId: string;
      variableKey: string;
      value: number;
      timestamp: bigint;
    }> = [];

    for (let i = 0; i < pointsCount; i++) {
      const t = startTime + i * intervalMs;
      const progress = i / pointsCount;
      // 24h diurnal curve: sine cycle for day/night
      const dayCycle = Math.sin(progress * Math.PI * 2);
      const tempVal = Number((26.0 + 7.5 * dayCycle + (Math.random() * 0.8 - 0.4)).toFixed(1));
      const humidVal = Number((60.0 - 18.0 * dayCycle + (Math.random() * 1.5 - 0.75)).toFixed(1));
      const soilMoist = Number((55.0 + 8.0 * Math.cos(progress * Math.PI * 2) + (Math.random() * 0.8 - 0.4)).toFixed(1));
      const fanVal = Math.round(35 + 40 * Math.max(0, dayCycle));
      const phVal = Number((6.6 + 0.3 * Math.sin(progress * Math.PI * 4) + (Math.random() * 0.08 - 0.04)).toFixed(2));
      const ecVal = Number((1.42 + 0.2 * Math.cos(progress * Math.PI * 3) + (Math.random() * 0.04 - 0.02)).toFixed(2));

      telemetryRecords.push(
        { projectId: project.id, deviceId: device.id, variableKey: "temperature", value: tempVal, timestamp: BigInt(t) },
        { projectId: project.id, deviceId: device.id, variableKey: "humidity", value: humidVal, timestamp: BigInt(t) },
        { projectId: project.id, deviceId: device.id, variableKey: "soil_moisture", value: soilMoist, timestamp: BigInt(t) },
        { projectId: project.id, deviceId: device.id, variableKey: "fan_speed", value: fanVal, timestamp: BigInt(t) },
        { projectId: project.id, deviceId: device.id, variableKey: "soil_ph", value: phVal, timestamp: BigInt(t) },
        { projectId: project.id, deviceId: device.id, variableKey: "soil_ec", value: ecVal, timestamp: BigInt(t) },
      );
    }

    await prisma.telemetry.createMany({
      data: telemetryRecords,
    });
  } else {
    console.log(`📊 Existing telemetry data found (${existingTelemetryCount} records), preserving history.`);
  }

  console.log("✅ Seeding completed!");
  console.log(`🔑 Hardware Ingestion Token: ${plainToken}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
