# Extending Raina

This guide explains how to add Dashboard widgets and Automation blocks without duplicating UI metadata or server-only behavior.

## Dashboard widgets

Widgets live in `apps/web/src/routes/dashboards/widgets`.

Each widget file owns two exports:

- The React component that renders the widget.
- A `WidgetManifest` that describes its name, category, icon, default size, editable properties, and layout quirks.

The central registry at `widgets/registry.ts` binds a widget id to those two exports. The palette, configuration panel, grid sizing, mobile layout, and dispatcher all read from that registry.

### Add a widget

1. Create `IotStatus.tsx` next to the other widgets.
2. Export both the component and its manifest.

```tsx
import type { WidgetManifest } from "./registry";

type IotStatusProps = {
  props: { title?: string; variable?: string };
  value?: unknown;
};

export function IotStatus({ props, value }: IotStatusProps) {
  return <div className="iot-widget-host iot-status">{String(value ?? "—")}</div>;
}

export const iotStatusManifest = {
  id: "iot-status",
  label: "Status",
  description: "Shows the latest status of one variable.",
  category: "Monitor",
  dataTypes: ["String", "Boolean"],
  usage: "Show whether a device is online, armed, or in an alarm state.",
  icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>',
  defaultSize: { w: 4, h: 2 },
  defaultProps: { title: "", variable: "" },
  fields: [
    { key: "title", label: "Title", type: "string" },
    { key: "variable", label: "Variable", type: "variable" },
  ],
} satisfies WidgetManifest;
```

3. Import both exports and add one entry to `WIDGET_REGISTRY` in `registry.ts`.
4. Add component styles in `widgets.css`, scoped beneath `.iot-status`.
5. Verify empty values, light/dark themes, resizing, mobile placement, and a saved Dashboard reload.

### Widget rules

- Use a stable, lowercase, hyphenated id such as `iot-status`.
- Use `Monitor` for read-only widgets and `Control` for widgets that send commands.
- Read values from the supplied `value` prop. For a time series, use `seriesMap`.
- Send device commands only through `onControl(variable, value)`.
- Keep secrets, MQTT access, and direct API calls out of widget components.
- Define `quirks.mobile.paired` only when a widget should share a phone row with another paired widget.
- Define `quirks.swapDimensionsOnPropChange` when a property changes the widget orientation.

## Automation blocks

Automation metadata lives in `packages/workflow/src/blocks`.

Each block manifest owns its category, ports, editable fields, icon path, and `summarize` function. `BLOCK_REGISTRY` in `blocks/index.ts` makes those definitions available to the Palette, Inspector, graph validation, Canvas summaries, and API validation.

Server execution is deliberately separate: it runs in `apps/server/src/lib`, where database, MQTT, and integration credentials are available.

### Add an Action

1. Add a manifest to `actions.ts` with a unique `kind`, input/output ports, fields, and `summarize` function.
2. Add the block to `ACTION_CATALOG`; it automatically becomes available through `BLOCK_REGISTRY`.
3. Add an executor to `ACTION_EXECUTORS` in `automation-action-executors.ts` using the same `kind`.
4. Add tests for the executor's successful result and its expected error cases.

```ts
{
  kind: "publish_mqtt",
  category: "action",
  label: "Publish MQTT",
  description: "Publish a message to a device topic.",
  icon: "M12 3v18m9-9H3",
  executable: true,
  ports: { in: ["in"], out: ["out"] },
  fields: [
    { key: "topic", label: "Topic", type: "text", required: true },
    { key: "payload", label: "Payload", type: "textarea" },
  ],
  summarize: (config) => [String(config.topic || "no topic")],
}
```

### Add a Condition

1. Add its manifest to `conditions.ts` and include `true` and `false` output ports.
2. Add its executor to `CONDITION_EXECUTORS` in `automation-condition-executors.ts`.
3. Return `true` or `false`; the engine selects the matching outgoing port.
4. Test both branches.

### Add a Trigger

1. Add its manifest to `triggers.ts` with an `out` port.
2. Extend the trigger-matching section in `engine.ts` when the trigger depends on a new event source.
3. Deliver the event to `executeAutomation` with a complete `AutomationContext`.
4. Test matching, non-matching, and disabled automation cases.

### Automation rules

- Keep fields, labels, icon path, ports, and `summarize` in the block definition.
- Keep server-only work in an executor. Browser code must never receive database access, broker credentials, or decrypted integration configuration.
- Validate user input before executing it. Treat URL, event, device, and topic input as untrusted.
- Make actions idempotent where practical because failed runs may be retried.
- Use `delay` for long waits; do not hold a server process open for a workflow timer.
- Preserve graph compatibility: never rename a shipped `kind` without a migration for saved automations.

## Verification

Run the relevant checks before submitting a change:

```bash
pnpm --filter @raina/workflow test
pnpm --filter @raina/server test
pnpm --filter @raina/web test
pnpm --filter @raina/web build
```
