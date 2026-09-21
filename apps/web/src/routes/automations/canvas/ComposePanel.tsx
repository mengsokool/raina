import { AlertCircle, ArrowRight, Check, PencilLine, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HelpTooltip } from "@/components/ui/help-tooltip";

type ReviewStep = { id: string; label: string; detail: string; needsReview: boolean };

export function ComposePanel({
  prompt,
  onPromptChange,
  onClose,
  onPreview,
  onGenerate,
  reviewSteps,
  onSelectStep,
  hasDraft,
  isExample,
  generating,
  error,
}: {
  prompt: string;
  onPromptChange: (value: string) => void;
  onClose: () => void;
  onPreview: () => void;
  onGenerate: () => void;
  reviewSteps: ReviewStep[];
  onSelectStep: (id: string) => void;
  hasDraft: boolean;
  isExample: boolean;
  generating: boolean;
  error: string | null;
}) {
  const example = "Every day at 08:00, emit a daily_check event";

  return (
    <aside
      data-testid="compose-panel"
      aria-label="Describe a workflow"
      className="fixed inset-x-0 bottom-0 z-40 flex max-h-3/4 min-h-0 flex-col rounded-t-xl border-t border-border bg-card shadow-xl lg:static lg:z-auto lg:h-full lg:max-h-none lg:w-80 lg:shrink-0 lg:rounded-none lg:border-r lg:border-t-0 lg:shadow-none"
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Sparkles className="size-4 text-primary" aria-hidden="true" />
          <span>Describe a workflow</span>
          <HelpTooltip
            label="Workflow composer instructions"
            triggerTestId="compose-header-help"
            content="Describe what you want to automate in natural language. Raina will draft triggers, conditions, and actions using the devices, variables, and integrations in this project."
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close workflow composer"
          className="rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="workflow-prompt" className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <span>What should happen?</span>
              <HelpTooltip
                label="Prompt instructions"
                triggerTestId="compose-prompt-help"
                content="Describe a trigger and the actions Raina should take (e.g. 'When greenhouse temperature rises above 30°C, turn on the fan.')."
              />
            </label>
          </div>
          <textarea
            id="workflow-prompt"
            data-testid="compose-prompt"
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            maxLength={1000}
            rows={5}
            placeholder="When the temperature rises above 30°C, turn on the fan."
            className="mt-2.5 w-full resize-y rounded-md border border-input bg-background px-3 py-2.5 text-sm leading-5 text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
          />
          <div className="mt-1 flex justify-end text-xs tabular-nums text-muted-foreground">
            {prompt.length}/1000
          </div>
          <Button type="button" className="mt-3 w-full" disabled={prompt.trim().length < 8 || generating} onClick={onGenerate} aria-describedby="generation-status">
            <Sparkles aria-hidden="true" /> {generating ? "Building draft…" : "Generate draft"}
          </Button>
          <span id="generation-status" className="sr-only">
            Drafts use the devices, variables, and integrations in this project. Review every step before saving.
          </span>
          {error && <p role="alert" className="mt-2 rounded-md bg-destructive/10 p-2.5 text-xs leading-5 text-destructive">{error}</p>}
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-xs font-semibold text-foreground">Try an example</p>
          <button
            type="button"
            data-testid="compose-example"
            onClick={() => {
              onPromptChange(example);
              onPreview();
            }}
            className="mt-2 flex w-full items-start justify-between gap-3 rounded-md border border-border bg-muted/40 p-3 text-left text-xs leading-5 text-foreground transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <span>{example}</span>
            <ArrowRight className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          </button>
        </div>

        {hasDraft && (
          <div data-testid="compose-review" className="border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PencilLine className="size-4 text-primary" aria-hidden="true" />
                <h2 className="text-xs font-semibold text-foreground">{isExample ? "Review example draft" : "Review generated draft"}</h2>
              </div>
              <HelpTooltip
                label="Review instructions"
                triggerTestId="compose-review-help"
                content="Select each step to inspect its settings. Saving this draft will keep it turned off."
              />
            </div>
            {isExample && prompt !== example && (
              <p className="mt-2 rounded-md bg-warning/10 px-2.5 py-2 text-xs leading-5 text-warning">
                The canvas still shows the example. Your edited text has not been generated.
              </p>
            )}
            <ul className="mt-3 space-y-1.5">
              {reviewSteps.map((step) => (
                <li key={step.id}>
                  <button
                    type="button"
                    onClick={() => onSelectStep(step.id)}
                    className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {step.needsReview ? (
                      <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                    ) : (
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    )}
                    <span>
                      <span className="block text-xs font-medium text-foreground">{step.label}</span>
                      <span className="block text-xs text-muted-foreground">{step.detail}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </aside>
  );
}
