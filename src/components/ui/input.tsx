import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1 text-base text-white shadow-sm transition-all file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-white placeholder:text-white/30 focus-visible:outline-none focus-visible:border-[#ff6b2b]/50 focus-visible:ring-1 focus-visible:ring-[#ff6b2b]/20 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
