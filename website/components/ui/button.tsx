// Button primitive — tuned for the light-first TraceBug theme.
// Variants stay small on purpose; we only ship what the site uses.

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium tracking-tight " +
  "transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
  "disabled:pointer-events-none disabled:opacity-50 active:translate-y-px",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-white shadow-glow-sm hover:shadow-glow-primary hover:brightness-110",
        gradient:
          "text-white bg-[linear-gradient(120deg,#818CF8,#6366F1_45%,#4F46E5)] shadow-glow-sm hover:shadow-glow-primary hover:brightness-[1.06]",
        secondary:
          "bg-surface text-text-primary border border-border hover:border-border-strong hover:bg-surface-2 shadow-xs",
        ghost:
          "text-text-muted hover:text-text-primary hover:bg-surface",
        outline:
          "border border-border-strong text-text-primary hover:border-primary/50 hover:text-primary",
      },
      size: {
        sm: "h-8 px-3.5 rounded-lg text-[12px]",
        md: "h-10 px-5 rounded-lg text-[13.5px]",
        lg: "h-12 px-6 rounded-xl text-[15px]",
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
