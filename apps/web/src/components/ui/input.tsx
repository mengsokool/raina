import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const inputVariants = cva(
  "flex h-7.5 w-full rounded-sm border border-input bg-background px-2.5 py-1 text-xs shadow-xs transition-colors file:border-0 file:bg-transparent file:text-xs file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 text-foreground",
  {
    variants: {
      variant: {
        default: "",
        mono: "font-mono",
        search: "pl-8 pr-8",
      },
      size: {
        default: "h-7.5 text-xs max-sm:h-11 max-sm:text-base max-sm:px-3.5",
        sm: "h-6 px-1.5 text-xs max-sm:h-11 max-sm:px-3.5 max-sm:text-base",
        lg: "h-9 px-3 text-sm max-sm:h-12 max-sm:px-4 max-sm:text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, variant, size, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(inputVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input, inputVariants };
