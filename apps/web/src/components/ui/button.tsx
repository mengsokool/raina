import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-sm text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0 cursor-pointer select-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 active:scale-98 font-bold",
        emerald: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 active:scale-98 font-bold",
        lime: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 active:scale-98 font-bold",
        destructive: "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 active:scale-98",
        "destructive-ghost": "text-destructive hover:bg-destructive/10 hover:text-destructive",
        "destructive-outline": "border border-destructive/30 text-destructive hover:bg-destructive/10 hover:border-destructive/60",
        "success-ghost": "text-success hover:bg-success/10 hover:text-success",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground text-foreground shadow-xs",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground text-muted-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-7.5 px-2.5 text-xs rounded-sm max-sm:h-11 max-sm:px-4 max-sm:text-sm",
        sm: "h-7 px-2 text-xs rounded-xs max-sm:h-11 max-sm:px-4 max-sm:text-sm",
        xs: "h-6 px-1.5 text-xs rounded-xs max-sm:h-10 max-sm:px-3 max-sm:text-sm",
        lg: "h-8.5 px-3.5 text-xs rounded-sm max-sm:h-12 max-sm:px-5 max-sm:text-base",
        icon: "h-7.5 w-7.5 p-0 rounded-sm max-sm:h-11 max-sm:w-11",
        "icon-sm": "h-7 w-7 p-0 rounded-xs max-sm:h-11 max-sm:w-11",
        "icon-xs": "h-6 w-6 p-0 rounded-xs max-sm:h-10 max-sm:w-10",
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
