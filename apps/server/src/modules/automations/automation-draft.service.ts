import { blocks, type AutomationGraph } from "@raina/workflow";

type VariableCandidate = { id: string; key: string; deviceId: string; deviceName: string; unit: string | null; value: string | null };
type IntegrationCandidate = { id: string; name: string; kind: string };
export type DraftCatalog = { variables: VariableCandidate[]; integrations: IntegrationCandidate[] };
export type DraftReviewItem = { nodeId?: string; label: string; detail: string; needsReview: boolean };
export type DraftResult = { graph: AutomationGraph; name: string; reviewItems: DraftReviewItem[] };

type ChoiceQuestion = { type: "choice"; instructions: string; criteria: Record<string, string> };
type ChoiceAnswer = { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> };
type JevResponse = { answers?: Record<string, ChoiceAnswer> };

const NONE = "none";
const question = (instructions: string, criteria: Record<string, string>): ChoiceQuestion => ({
  type: "choice", instructions, criteria: { ...criteria, [NONE]: "No matching item, no explicit value, or unclear request" },
});

const selected = (response: JevResponse, id: string, valid: Record<string, string>): string | null => {
  const answer = response.answers?.[id];
  if (!answer || answer.type !== "choice" || !Object.hasOwn(valid, answer.choice)) return null;
  const probability = answer.probabilities?.[answer.choice];
  if (answer.choice === NONE || !Number.isFinite(probability) || probability < 0.5 || answer.confidence < 0.3) return null;
  return answer.choice;
};

const distinct = (items: string[], limit = 20) => [...new Set(items)].slice(0, limit);
const tokenOptions = (values: string[], prefix: string) => Object.fromEntries(values.map((value, index) => [`${prefix}${index}`, value]));
const slug = (value: string) => value.trim().replace(/[^a-zA-Z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);

const matchTime = (prompt: string) => distinct(
  [...prompt.matchAll(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g)].map((match) => match[0].padStart(5, "0"))
);
const matchNumbers = (prompt: string) => distinct(
  [...prompt.matchAll(/(?<![\w:])[-+]?\d+(?:\.\d+)?(?![\w:])/g)].map((match) => match[0])
);

function commandValue(raw: string, current: string | null): string | null {
  if (raw !== "on" && raw !== "off") return raw;
  const sample = current?.trim().toLowerCase();
  if (sample === "on" || sample === "off") return raw;
  if (sample === "true" || sample === "false") return raw === "on" ? "true" : "false";
  if (sample === "1" || sample === "0") return raw === "on" ? "1" : "0";
  return null;
}

/** Jev selects from project-scoped candidates; only code creates graph nodes. */
export async function generateAutomationDraft(
  prompt: string,
  timezone: string,
  catalog: DraftCatalog,
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<DraftResult> {
  const variables = catalog.variables.slice(0, 80);
  const integrations = catalog.integrations.slice(0, 80);
  const variableOptions = Object.fromEntries(variables.map((item, index) => [`v${index}`, `${item.key} on ${item.deviceName}${item.unit ? ` (${item.unit})` : ""}`]));
  const integrationOptions = Object.fromEntries(integrations.map((item, index) => [`i${index}`, `${item.name} (${item.kind})`]));
  const times = matchTime(prompt);
  const numbers = matchNumbers(prompt);
  const numberOptions = tokenOptions(numbers, "n");
  const timeOptions = tokenOptions(times, "t");
  const valueOptions = { ...numberOptions, on: "Turn on / enable / เปิด", off: "Turn off / disable / ปิด" };

  const questions: Record<string, ChoiceQuestion> = {
    trigger_kind: question("Which existing trigger does the request describe? Choose variable only for a sensor/value threshold or change, schedule only for a time of day, event only for a named incoming event.", {
      variable: "A project variable crosses a threshold or changes",
      schedule: "A daily or weekday clock time",
      event: "An existing named event occurs",
      manual: "Explicitly run on demand",
    }),
    action_count: question("How many distinct actions should happen after the trigger? Count commands, notifications, and events, but not the trigger condition.", {
      one: "Exactly one action",
      two: "Exactly two actions",
      many: "Three or more actions",
    }),
    trigger_operator: question("If this is a variable trigger, what comparison does the request specify?", {
      gt: "Above, exceeds, greater than",
      gte: "At least or greater than or equal",
      lt: "Below or less than",
      lte: "At most or less than or equal",
      eq: "Equals a stated value",
      changed: "Any change to the variable",
    }),
  };

  if (variables.length) questions.trigger_variable = question("Which project variable is the trigger sensor or condition about? Select by meaning and device name.", variableOptions);
  if (numbers.length) questions.trigger_number = question("Which numeric value is the trigger threshold, not an action output or time?", numberOptions);
  if (times.length) questions.trigger_time = question("Which explicit clock time specifies when the schedule should run?", timeOptions);

  for (const slot of [1, 2]) {
    questions[`action${slot}_kind`] = question(`What is action ${slot} after the trigger, in the order written? Treat a notification as an integration call.`, {
      set_variable: "Control or set a device variable such as a fan, relay, light or setpoint",
      call_integration: "Send a notification or invoke an existing configured integration",
      emit_event: "Emit a named internal event",
    });
    if (variables.length) questions[`action${slot}_variable`] = question(`Which project variable should action ${slot} set? Ignore this answer unless action ${slot} is a device/value control.`, variableOptions);
    if (integrations.length) questions[`action${slot}_integration`] = question(`Which configured integration should action ${slot} invoke? Ignore this answer unless action ${slot} is a notification or integration call.`, integrationOptions);
    questions[`action${slot}_value`] = question(`If action ${slot} sets a variable, what explicit value or on/off command is requested for that action? Ignore the trigger threshold.`, valueOptions);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let raw: Response;
  try {
    raw = await fetcher("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "jev-latest",
        state: { request: prompt, timezone, availableVariables: variables.map(({ key, deviceName, unit }) => ({ key, deviceName, unit })), availableIntegrations: integrations.map(({ name, kind }) => ({ name, kind })) },
        questions,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!raw.ok) throw new Error(raw.status === 429 || raw.status === 529 ? "TypeSafe is busy. Try again shortly." : "Could not generate a draft with TypeSafe.");
  const response = (await raw.json()) as JevResponse;
  if (!response || typeof response.answers !== "object") throw new Error("TypeSafe returned an invalid response.");

  const graph: AutomationGraph = { nodes: [], edges: [] };
  const reviewItems: DraftReviewItem[] = [];
  const triggerKind = selected(response, "trigger_kind", questions.trigger_kind.criteria);
  const addNode = (kind: string, config: Record<string, unknown>) => {
    const id = `draft_${graph.nodes.length + 1}`;
    const previous = graph.nodes.at(-1);
    graph.nodes.push({ id, kind, config, x: 80 + graph.nodes.length * 290, y: 160 });
    if (previous) graph.edges.push({ from: previous.id, to: id, port: "out" });
    return id;
  };
  const review = (nodeId: string | undefined, label: string, detail: string, needsReview: boolean) => reviewItems.push({ nodeId, label, detail, needsReview });

  if (triggerKind === "variable") {
    const choice = selected(response, "trigger_variable", questions.trigger_variable?.criteria ?? {});
    const variable = choice ? variables[Number(choice.slice(1))] : undefined;
    const op = selected(response, "trigger_operator", questions.trigger_operator.criteria);
    const operators: Record<string, string> = { gt: ">", gte: ">=", lt: "<", lte: "<=", eq: "==", changed: "changed" };
    const numberChoice = selected(response, "trigger_number", questions.trigger_number?.criteria ?? {});
    const threshold = numberChoice ? numbers[Number(numberChoice.slice(1))] : undefined;
    const config = { variable: variable?.key ?? "", device: variable?.deviceId ?? "", operator: operators[op ?? ""] ?? "changed", value: op === "changed" ? "" : threshold ?? "" };
    const id = addNode("variable", config);
    review(id, "Trigger", variable && op && (op === "changed" || threshold) ? `${variable.key} ${config.operator} ${config.value}` : "Choose a sensor, comparison, or threshold.", !(variable && op && (op === "changed" || threshold)));
  } else if (triggerKind === "schedule") {
    const timeChoice = selected(response, "trigger_time", questions.trigger_time?.criteria ?? {});
    const time = timeChoice ? times[Number(timeChoice.slice(1))] : undefined;
    const id = addNode("schedule", { time: time ?? "", days: [], tz: timezone });
    review(id, "Trigger", time ? `Every day at ${time} · ${timezone}` : "Set the schedule time in the inspector.", !time);
  } else if (triggerKind === "manual") {
    const id = addNode("manual", {});
    review(id, "Trigger", "Run manually", false);
  } else if (triggerKind === "event") {
    const eventMatch = prompt.match(/\b[a-zA-Z][a-zA-Z0-9_]{2,63}\b(?=\s+(?:event|occurs|fires))/i);
    const id = addNode("event", { event: eventMatch?.[0] ?? "" });
    review(id, "Trigger", eventMatch ? `Event ${eventMatch[0]}` : "Enter the incoming event name.", !eventMatch);
  } else {
    review(undefined, "Trigger", "Choose a trigger from the block catalog or describe it more specifically.", true);
  }

  const count = selected(response, "action_count", questions.action_count.criteria);
  const slots = count === "two" || count === "many" ? 2 : 1;
  for (let slot = 1; slot <= slots; slot++) {
    const kind = selected(response, `action${slot}_kind`, questions[`action${slot}_kind`].criteria);
    if (!kind) {
      review(undefined, `Action ${slot}`, "Choose an action from the block catalog or describe it more specifically.", true);
      continue;
    }
    if (kind === "set_variable") {
      const variableChoice = selected(response, `action${slot}_variable`, questions[`action${slot}_variable`]?.criteria ?? {});
      const variable = variableChoice ? variables[Number(variableChoice.slice(1))] : undefined;
      const valueChoice = selected(response, `action${slot}_value`, questions[`action${slot}_value`].criteria);
      const rawValue = valueChoice === "on" || valueChoice === "off" ? valueChoice : valueChoice ? numbers[Number(valueChoice.slice(1))] : undefined;
      const value = rawValue ? commandValue(rawValue, variable?.value ?? null) : null;
      const id = addNode("set_variable", { variable: variable?.key ?? "", device: variable?.deviceId ?? "", value: value ?? "" });
      review(id, `Action ${slot}`, variable && value !== null ? `Set ${variable.key} on ${variable.deviceName} to ${value}` : "Choose a device variable and an explicit value.", !(variable && value !== null));
    } else if (kind === "call_integration") {
      const integrationChoice = selected(response, `action${slot}_integration`, questions[`action${slot}_integration`]?.criteria ?? {});
      const integration = integrationChoice ? integrations[Number(integrationChoice.slice(1))] : undefined;
      const id = addNode("call_integration", { integration_id: integration?.id ?? "" });
      review(id, `Action ${slot}`, integration ? `Call ${integration.name}` : "Choose a configured integration.", !integration);
    } else if (kind === "emit_event") {
      const eventMatch = prompt.match(/\b[a-zA-Z][a-zA-Z0-9_]{2,63}\b(?=\s+event\b)/i);
      const id = addNode("emit_event", { event: eventMatch?.[0] ?? "" });
      review(id, `Action ${slot}`, eventMatch ? `Emit ${eventMatch[0]}` : "Enter the event name in the inspector.", !eventMatch);
    }
  }
  if (count === "many") review(undefined, "More actions", "Only the first two actions were drafted. Add the remaining steps manually.", true);
  if (catalog.variables.length > variables.length || catalog.integrations.length > integrations.length) review(undefined, "Catalog limit", "Only the first 80 variables and integrations were considered. Check the selected targets.", true);
  const structuralError = graph.nodes.length ? blocks.graphError(graph) : "No supported trigger was found";
  if (structuralError) review(undefined, "Workflow", structuralError, true);
  return { graph, name: "New automation draft", reviewItems };
}
