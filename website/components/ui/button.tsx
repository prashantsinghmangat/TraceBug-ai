// shadcn/ui-style button primitive, tuned for the TraceBug cyber-graphite theme.
// Variants stay small on purpose — we only ship what the site actually uses.

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium tracking-tight " +
  "transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
  "disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-white hover:bg-primary/90 shadow-glow-sm hover:shadow-glow-primary",
        secondary:
          "bg-surface/60 text-text-primary border border-border hover:border-border-strong hover:bg-surface",
        ghost:
          "text-text-muted hover:text-text-primary hover:bg-surface/60",
        outline:
          "border border-border text-text-primary hover:border-border-strong",
      },
      size: {
        sm: "h-8 px-3 rounded-md text-[12px]",
        md: "h-9 px-4 rounded-md text-[13px]",
        lg: "h-10 px-5 rounded-md text-[14px]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp: any = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
