import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium cursor-pointer transition-[color,background-color,border-color,box-shadow,transform,filter] duration-150 ease-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#ff6b2b]/50 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-[#ff6b2b] to-[#f04400] text-white shadow-[0_0_15px_rgba(255,107,43,0.3)] hover:shadow-[0_0_20px_rgba(255,107,43,0.5)] hover:brightness-110 font-semibold active:scale-[0.98]",
        destructive:
          "bg-red-500/80 text-white shadow-sm hover:bg-red-500/90 active:scale-[0.98]",
        outline:
          "border border-white/10 bg-white/[0.04] text-white/80 shadow-sm hover:bg-white/[0.08] hover:text-white hover:border-white/20 active:scale-[0.98]",
        secondary:
          "bg-white/[0.08] text-white/90 shadow-sm hover:bg-white/[0.12] hover:text-white active:scale-[0.98]",
        ghost: "hover:bg-white/[0.08] text-white/70 hover:text-white",
        link: "text-[#ff6b2b] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 rounded-xl",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-10 rounded-xl px-8 font-semibold",
        icon: "h-9 w-9 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
