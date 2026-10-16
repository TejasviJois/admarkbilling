import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary:
          "border-white/10 bg-white/[0.06] text-white/80 hover:bg-white/[0.1]",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
        outline: "border-white/15 text-white/80",
        gradient: "border-transparent bg-gradient-to-r from-[#ff6b2b] to-[#f04400] text-white shadow-md shadow-orange-500/25",
        glass: "border-white/10 bg-white/[0.04] text-white/90 backdrop-blur-md shadow-sm",
        emerald: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.15)]",
        rose: "border-rose-500/20 bg-rose-500/10 text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.15)]",
        cyan: "border-cyan-500/20 bg-cyan-500/10 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.15)]",
        purple: "border-purple-500/20 bg-purple-500/10 text-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.15)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
