import React, { Suspense } from "react";
import { AutomationEditor } from "./canvas/AutomationEditor";
import { LoaderCircle } from "lucide-react";

export function meta() {
  return [
    { title: "Automation Graph Editor — raina" },
    { name: "description", content: "Visual node-based IoT automation editor" },
  ];
}

export default function AutomationEditorPage() {
  return (
    <Suspense
      fallback={
        <div className="grid h-full place-items-center bg-neutral-50 dark:bg-neutral-950">
          <LoaderCircle className="h-6 w-6 animate-spin text-lime-500 dark:text-lime-400" />
        </div>
      }
    >
      <div className="h-[calc(100dvh-3.5rem)] w-full overflow-hidden">
        <AutomationEditor />
      </div>
    </Suspense>
  );
}
