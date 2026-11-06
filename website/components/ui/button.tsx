// Button primitive — tuned for the light-first TraceBug theme.
// Variants stay small on purpose; we only ship what the site uses.

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium " +
  "transition-[color,background-color,border-color,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
  "disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        // Ink on light, off-white on dark. The accent is kept for the content.
        primary:
          "bg-text-primary text-background hover:bg-text-primary/85",
        // Retired: the hue gradient. Same as primary so old call sites stay calm.
        gradient:
          "bg-text-primary text-background hover:bg-text-primary/85",
        secondary:
          "bg-background text-text-primary border border-border-strong hover:bg-surface",
        ghost:
          "text-text-muted hover:text-text-primary hover:bg-surface",
        outline:
          "border border-border-strong text-text-primary hover:bg-surface",
      },
      size: {
        sm: "h-8 px-3 rounded-md text-[13px]",
        md: "h-10 px-4 rounded-lg text-[14px]",
        lg: "h-12 px-5 rounded-[10px] text-[15px]",
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
