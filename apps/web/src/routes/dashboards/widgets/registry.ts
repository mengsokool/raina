import type { ComponentType } from "react";
import { IotChart, iotChartManifest } from "./IotChart";
import { IotColor, iotColorManifest } from "./IotColor";
import { IotGauge, iotGaugeManifest } from "./IotGauge";
import { IotPercent, iotPercentManifest } from "./IotPercent";
import { IotPush, iotPushManifest } from "./IotPush";
import { IotSlider, iotSliderManifest } from "./IotSlider";
import { IotToggle, iotToggleManifest } from "./IotToggle";
import { IotValue, iotValueManifest } from "./IotValue";

export type WidgetSelectOption = string | { value: string; label: string };

export type WidgetField = {
  type: string;
  key?: string;
  label?: string;
  placeholder?: string;
  suffix?: string;
  default?: unknown;
  options?: readonly WidgetSelectOption[];
  fields?: readonly WidgetField[];
  addLabel?: string;
  removeLabel?: string;
  showWhen?: { key: string; equals: unknown };
};

export type WidgetManifest = {
  id: string;
  label: string;
  description: string;
  category: "Monitor" | "Control";
  dataTypes: readonly string[];
  usage: string;
  icon: string;
  defaultSize: { w: number; h: number };
  minSize?: { w: number; h: number };
  defaultProps: Record<string, unknown>;
  fields: readonly WidgetField[];
  quirks?: {
    mobile?: { paired?: boolean };
    swapDimensionsOnPropChange?: string;
  };
};

export type WidgetComponentProps = {
  props: Record<string, unknown>;
  value?: unknown;
  seriesMap?: Record<string, { t: number[]; v: number[] }>;
  widgetId?: string;
  onControl?: (key: string, value: unknown) => Promise<void> | void;
};

export type WidgetDefinition = {
  manifest: WidgetManifest;
  Component: ComponentType<any>;
};

export const WIDGET_REGISTRY = {
  "iot-value": { manifest: iotValueManifest, Component: IotValue },
  "iot-gauge": { manifest: iotGaugeManifest, Component: IotGauge },
  "iot-chart": { manifest: iotChartManifest, Component: IotChart },
  "iot-toggle": { manifest: iotToggleManifest, Component: IotToggle },
  "iot-push": { manifest: iotPushManifest, Component: IotPush },
  "iot-slider": { manifest: iotSliderManifest, Component: IotSlider },
  "iot-color": { manifest: iotColorManifest, Component: IotColor },
  "iot-percent": { manifest: iotPercentManifest, Component: IotPercent },
} satisfies Record<string, WidgetDefinition>;

export type WidgetType = keyof typeof WIDGET_REGISTRY;

export const CATALOG = Object.values(WIDGET_REGISTRY).map(({ manifest }) => manifest);
export const WIDGET_IDS = Object.keys(WIDGET_REGISTRY) as WidgetType[];
export const ALLOWED_TYPES: ReadonlySet<WidgetType> = new Set(WIDGET_IDS);

export function definitionFor(type: string): WidgetDefinition | undefined {
  return WIDGET_REGISTRY[type as WidgetType];
}

export function manifestFor(type: string): WidgetManifest {
  const definition = definitionFor(type);
  if (!definition) throw new Error(`Unknown widget type: ${type}`);
  return definition.manifest;
}
