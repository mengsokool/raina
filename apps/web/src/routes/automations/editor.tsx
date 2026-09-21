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
        <div className="grid h-full place-items-center bg-background">
          <LoaderCircle className="size-6 animate-spin text-primary" />
        </div>
      }
    >
      <div className="h-full w-full overflow-hidden">
        <AutomationEditor />
      </div>
    </Suspense>
  );
}
