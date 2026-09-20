# Create an automation with a sentence

Status: UX design brief. The first UI pass is in the automation list/editor, including an explicit example preview. Jev generation and the server response contract are implemented.

## Goal

An operator describes a routine in ordinary language, gets an editable workflow draft, checks every device command, then saves it as disabled. The feature helps people start an automation; the existing canvas remains the place to inspect and finish it.

Example: “When greenhouse temperature rises above 30°C, turn on the exhaust fan and send a Telegram alert.”

Success means a first-time operator can reach a valid draft without learning the block catalog, identify what the system inferred, and make a deliberate choice before anything can run.

## Entry and layout

Add a secondary **Describe a workflow** action beside the existing New automation action on the automation list. The ordinary blank editor and recipes remain available. Opening this action navigates to the existing editor in a compose state. For a blank editor, also offer **Describe instead** in the canvas empty state. Do not place the prompt in a modal: the sentence and the resulting graph need to be visible together.

Desktop: use a 320–360 px compose panel on the left, the existing graph canvas in the center, and the existing inspector on the right when a block is selected. The compose panel replaces the block palette while open; a **Blocks** control switches back. On narrow screens, present compose as a bottom sheet; once a draft is generated, close the sheet to show the canvas and leave a **Review draft** control to reopen it.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ ←  New automation                                      Unsaved      Save draft │
├───────────────────────┬─────────────────────────────────────────────────────┤
│ Describe a workflow   │                                                     │
│                       │    [temperature > 30] ── [fan = on] ── [Telegram]   │
│ [your instruction...] │                                                     │
│                       │                                                     │
│ [Generate draft]      │                                                     │
│                       │                                                     │
│ Review               │                                                     │
│ ✓ Trigger understood  │                                                     │
│ ! Choose a fan device │                                                     │
│ ✓ Alert destination   │                                                     │
│                       │                                                     │
│ [Blocks]              │                                                     │
└───────────────────────┴─────────────────────────────────────────────────────┘
```

Visual direction: retain Raina's neutral canvas, compact sans-serif labels, lime primary action, and existing node colors. The compose panel should feel like an editor tool, not a chat interface. No avatar, conversation bubbles, or animated “thinking” copy. At a desk or in a control room, the operator is focused on a live environment and needs a calm, legible review surface in either light or dark theme.

## Interaction flow

1. **Describe.** Show one multiline input, a concise example that uses a real project variable and action when available, and a character limit. Enter adds a line; Ctrl/Cmd+Enter generates. Disable the action for empty text. Prompt text stays editable after generation.
2. **Interpret.** Show progress in the compose panel without replacing the canvas. Send only the current project's permitted devices, variables, integrations, and block definitions to the server. If the user changes the prompt while generation is running, ignore the stale response.
3. **Review.** Show a draft graph on the canvas and a compact review list in the panel: trigger, each condition, each action, and any missing or ambiguous selection. Selecting a review item focuses the corresponding node and opens the existing inspector. Differentiate **Found in your project**, **Needs your choice**, and **Not supported** with text and icon as well as color.
4. **Edit.** The operator can change block settings, add/remove blocks, or revise the prompt and regenerate. Regeneration must ask before replacing a graph with unsaved manual edits; retain the current graph if generation fails.
5. **Save draft.** Save only after the graph passes existing structural and block validation. A newly generated automation is saved with `enabled: false`, and the confirmation says “Draft saved. Turn it on when you're ready.” Enabling is a separate action after review. The first release should not auto-run or publish device commands from the compose flow.

## Key states and copy

| State | User sees | Primary next step |
| --- | --- | --- |
| Empty project | “Add a device and a variable to describe a device workflow.” | Open Devices, or create a manual workflow |
| Ready | “Describe when something happens and what Raina should do.” | Generate draft |
| Interpreting | “Building a draft…” with a compact progress indicator | Wait or cancel |
| Complete | Graph plus “Review these steps before saving.” | Inspect flagged items |
| Ambiguous match | “Which fan did you mean?” with only eligible devices | Choose a device |
| Missing value | “What temperature should trigger this?” | Enter a value in the inspector |
| Unsupported request | “I can't build that step yet. You can add it manually.” | Edit graph or revise prompt |
| Service error | “Couldn't build a draft. Your text and graph are still here.” | Retry |
| Existing graph | “Replace your unsaved changes with a new draft?” | Keep graph or replace |

Avoid showing a single “AI confidence: 87%” badge. Show the specific choices requiring attention. If probabilities are useful for review, use them internally to decide whether to preselect, ask, or mark unsupported; tune thresholds on real examples. A concentrated Choice distribution is not proof that a command is safe.

## Scope of the first version

Support one trigger, optional conditions, and one or more existing actions. Prefer commands that map to the current block catalog: variable threshold or schedule triggers, variable/time conditions, set-variable, emit-event, and configured integration actions. Multi-step requests can become a linear graph. A request for a new integration, unknown device, unspecified threshold, or action outside the catalog produces a review item instead of a fabricated block.

Use Jev for bounded semantic choices: which existing trigger/action family fits, which device/variable/integration a phrase refers to, and whether a sentence contains multiple actions. Use code for project scoping, exact numeric/time parsing where possible, graph assembly, validation, permissions, and saving. If a free-form value cannot be parsed reliably, ask the user to supply it. Batch independent Jev questions over the same state; make a second call only when an earlier answer determines the candidates. The server must not send credentials or integration secrets in model state.

The server response to the UI should distinguish `graph`, `reviewItems` (node/field, reason, candidates), `unsupportedParts`, and `requestVersion`. The UI should not have to infer uncertainty from prose. Store the original prompt only if the operator chooses to save it; the graph is the executable artifact.

## Acceptance checks for implementation

- An operator can generate from a valid project-specific instruction, inspect every inferred command on the existing canvas, edit it, and save a disabled draft.
- Unknown or ambiguous devices never silently map to another project's device or to an arbitrary first match.
- A failed or stale generation never deletes the operator's text or existing graph.
- Keyboard and mobile users can reach the prompt, review items, canvas nodes, inspector, and save action; focus moves to the first unresolved item after generation.
- Review items and graph validation agree: the UI cannot present “ready” while required block fields are missing.
- Existing manual creation and recipes still open the same editor and work without the compose panel.

## Existing implementation anchors

- `apps/web/src/routes/automations/list.tsx`: New automation entry.
- `apps/web/src/routes/automations/canvas/AutomationEditor.tsx`: canvas, inspector, save validation, undo/redo.
- `packages/workflow/src/blocks/`: supported trigger, condition, and action catalog.
- `apps/server/src/modules/automations/automations.routes.ts`: graph validation and create/update routes.

TypeSafe references: [smart home demo](https://docs.typesafe.ai/demos/smart-home.md), [function calling cookbook](https://docs.typesafe.ai/cookbooks/function_calling.md), [confidence](https://docs.typesafe.ai/confidence.md).
