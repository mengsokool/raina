import { AlertCircle, ArrowRight, Check, PencilLine, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

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
      className="fixed inset-x-0 bottom-0 z-40 flex max-h-[78dvh] min-h-0 flex-col rounded-t-xl border-t border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-950 lg:static lg:z-auto lg:h-full lg:max-h-none lg:w-80 lg:shrink-0 lg:rounded-none lg:border-r lg:border-t-0 lg:shadow-none"
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 px-4 dark:border-neutral-800">
        <div className="flex items-center gap-2 text-sm font-semibold text-neutral-950 dark:text-white">
          <Sparkles className="h-4 w-4 text-lime-700 dark:text-lime-400" aria-hidden="true" />
          Describe a workflow
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close workflow composer"
          className="rounded-sm p-1.5 text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-500 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <div>
          <label htmlFor="workflow-prompt" className="block text-xs font-semibold text-neutral-900 dark:text-neutral-100">
            What should happen?
          </label>
          <p className="mt-1 text-xs leading-5 text-neutral-600 dark:text-neutral-300">
            Describe a trigger and the actions Raina should take.
          </p>
          <textarea
            id="workflow-prompt"
            data-testid="compose-prompt"
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            maxLength={1000}
            rows={5}
            placeholder="When the temperature rises above 30°C, turn on the fan."
            className="mt-3 w-full resize-y rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm leading-5 text-neutral-950 outline-none transition-colors placeholder:text-neutral-600 focus:border-lime-700 focus:ring-2 focus:ring-lime-500/30 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:placeholder:text-neutral-300 dark:focus:border-lime-400"
          />
          <div className="mt-1 flex justify-end text-[11px] tabular-nums text-neutral-600 dark:text-neutral-400">
            {prompt.length}/1000
          </div>
          <Button type="button" className="mt-3 w-full" disabled={prompt.trim().length < 8 || generating} onClick={onGenerate} aria-describedby="generation-status">
            <Sparkles aria-hidden="true" /> {generating ? "Building draft…" : "Generate draft"}
          </Button>
          <p id="generation-status" className="mt-2 text-xs leading-5 text-neutral-600 dark:text-neutral-300">
            Drafts use the devices, variables, and integrations in this project. Review every step before saving.
          </p>
          {error && <p role="alert" className="mt-2 rounded-md bg-red-50 p-2.5 text-xs leading-5 text-red-800 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
        </div>

        <div className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">Try an example</p>
          <button
            type="button"
            data-testid="compose-example"
            onClick={() => {
              onPromptChange(example);
              onPreview();
            }}
            className="mt-2 flex w-full items-start justify-between gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-left text-xs leading-5 text-neutral-800 transition-colors hover:border-lime-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-lime-400"
          >
            <span>{example}</span>
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-lime-700 dark:text-lime-400" aria-hidden="true" />
          </button>
        </div>

        {hasDraft && (
          <div data-testid="compose-review" className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
            <div className="flex items-center gap-2">
              <PencilLine className="h-4 w-4 text-lime-700 dark:text-lime-400" aria-hidden="true" />
              <h2 className="text-xs font-semibold text-neutral-950 dark:text-white">{isExample ? "Review example draft" : "Review generated draft"}</h2>
            </div>
            <p className="mt-1 text-xs leading-5 text-neutral-600 dark:text-neutral-300">
              Select each step to inspect its settings. Saving this draft will keep it turned off.
            </p>
            {isExample && prompt !== example && (
              <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-2 text-xs leading-5 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                The canvas still shows the example. Your edited text has not been generated.
              </p>
            )}
            <ul className="mt-3 space-y-1.5">
              {reviewSteps.map((step) => (
                <li key={step.id}>
                  <button
                    type="button"
                    onClick={() => onSelectStep(step.id)}
                    className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-500 dark:hover:bg-neutral-800"
                  >
                    {step.needsReview ? (
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
                    ) : (
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-lime-700 dark:text-lime-400" aria-hidden="true" />
                    )}
                    <span>
                      <span className="block text-xs font-medium text-neutral-900 dark:text-neutral-100">{step.label}</span>
                      <span className="block text-xs text-neutral-600 dark:text-neutral-300">{step.detail}</span>
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
