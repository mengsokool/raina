import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-sm text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lime-500 dark:focus-visible:ring-lime-400 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0 cursor-pointer select-none",
  {
    variants: {
      variant: {
        default: "bg-lime-400 text-black shadow-xs hover:bg-lime-300 active:scale-[0.98] font-bold dark:bg-lime-400 dark:text-black dark:hover:bg-lime-300",
        emerald: "bg-lime-400 text-black shadow-xs hover:bg-lime-300 active:scale-[0.98] font-bold",
        lime: "bg-lime-400 text-black shadow-xs hover:bg-lime-300 active:scale-[0.98] font-bold",
        destructive: "bg-red-600 text-white shadow-xs hover:bg-red-700 active:scale-[0.98]",
        outline: "border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 hover:bg-lime-50 dark:hover:bg-lime-950/30 text-neutral-900 dark:text-neutral-100 shadow-xs hover:border-lime-400/60 dark:hover:border-lime-500/50",
        secondary: "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-700",
        ghost: "hover:bg-lime-100/60 dark:hover:bg-lime-950/40 text-neutral-700 dark:text-neutral-300 hover:text-lime-900 dark:hover:text-lime-300",
        link: "text-lime-600 dark:text-lime-400 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-7.5 px-2.5 text-xs rounded-sm",
        sm: "h-7 px-2 text-xs rounded-xs",
        xs: "h-6 px-1.5 text-[11px] rounded-xs",
        lg: "h-8.5 px-3.5 text-xs rounded-sm",
        icon: "h-7.5 w-7.5 p-0 rounded-sm",
        "icon-sm": "h-7 w-7 p-0 rounded-xs",
        "icon-xs": "h-6 w-6 p-0 rounded-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
