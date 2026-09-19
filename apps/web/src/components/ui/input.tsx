import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-7.5 w-full rounded-sm border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-2.5 py-1 text-xs shadow-xs transition-colors file:border-0 file:bg-transparent file:text-xs file:font-medium placeholder:text-neutral-400 focus-visible:outline-none focus-visible:border-neutral-900 focus-visible:ring-1 focus-visible:ring-neutral-900 dark:focus-visible:border-neutral-100 dark:focus-visible:ring-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 text-neutral-900 dark:text-neutral-100",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
