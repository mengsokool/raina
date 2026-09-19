import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-xs border px-1.5 py-0.2 text-[10px] font-mono font-medium transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default: "border-neutral-200 bg-neutral-100 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-100",
        emerald: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        secondary: "border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400",
        destructive: "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400",
        outline: "border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
