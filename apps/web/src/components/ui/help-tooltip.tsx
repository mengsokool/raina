import * as React from "react";
import { CircleHelp } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface HelpTooltipProps {
  content: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  label?: string;
  className?: string;
  iconClassName?: string;
  triggerTestId?: string;
}

export function HelpTooltip({
  content,
  side = "top",
  align = "center",
  label = "Help and details",
  className,
  iconClassName,
  triggerTestId,
}: HelpTooltipProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-testid={triggerTestId}
            aria-label={label}
            onClick={(e) => {
              e.preventDefault();
              setOpen((prev) => !prev);
            }}
            className={cn(
              "inline-flex items-center justify-center rounded-xs p-0.5 text-neutral-400 transition-colors hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lime-500 dark:text-neutral-500 dark:hover:text-neutral-200",
              className
            )}
          >
            <CircleHelp className={cn("h-3.5 w-3.5 shrink-0", iconClassName)} aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          align={align}
          sideOffset={6}
          className="max-w-[260px] rounded-md bg-neutral-900 p-2.5 font-sans text-xs font-normal leading-relaxed text-neutral-100 shadow-xl dark:bg-neutral-800 dark:text-neutral-100"
        >
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
