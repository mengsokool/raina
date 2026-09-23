import { describe, expect, it } from "vitest";
import { effectiveMobileLayout, deriveMobilePlacements } from "../routes/dashboards/grid/mobile-layout";
import { Layout } from "@/types";

describe("Dashboard Mobile & Desktop Layout Separation", () => {
  const sampleDesktopLayout: Layout = {
    grid: { columns: 24 },
    items: [
      { id: "w1", type: "iot-value", props: {}, x: 0, y: 0, w: 12, h: 4 },
      { id: "w2", type: "iot-gauge", props: {}, x: 12, y: 0, w: 12, h: 4 },
      { id: "w3", type: "iot-chart", props: {}, x: 0, y: 4, w: 24, h: 6 },
    ],
  };

  it("derives automatic mobile placements when no override is present", () => {
    const mobile = effectiveMobileLayout(sampleDesktopLayout);
    expect(mobile.items.length).toBe(3);
    expect(mobile.items.find((i) => i.id === "w1")?.w).toBe(12); // paired value
    expect(mobile.items.find((i) => i.id === "w2")?.w).toBe(12); // paired gauge
    expect(mobile.items.find((i) => i.id === "w3")?.w).toBe(24); // full width chart
  });

  it("applies mobile override without altering original desktop items", () => {
    // User rearranged mobile items so w3 is at the top (y=0) and w1 is lower
    const layoutWithMobileOverride: Layout = {
      ...sampleDesktopLayout,
      mobile: {
        items: [
          { id: "w3", x: 0, y: 0, w: 24, h: 6 },
          { id: "w1", x: 0, y: 6, w: 24, h: 4 },
          { id: "w2", x: 0, y: 10, w: 24, h: 4 },
        ],
      },
    };

    const mobileEffective = effectiveMobileLayout(layoutWithMobileOverride);

    // Mobile effective layout follows the override
    expect(mobileEffective.items[0].id).toBe("w3");
    expect(mobileEffective.items[0].y).toBe(0);
    expect(mobileEffective.items[1].id).toBe("w1");
    expect(mobileEffective.items[1].y).toBe(6);

    // Desktop items remain intact with their original positions
    expect(layoutWithMobileOverride.items[0].id).toBe("w1");
    expect(layoutWithMobileOverride.items[0].x).toBe(0);
    expect(layoutWithMobileOverride.items[0].y).toBe(0);
    expect(layoutWithMobileOverride.items[0].w).toBe(12);
  });
});
