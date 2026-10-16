import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[60px] w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-base text-white shadow-sm placeholder:text-white/30 focus-visible:outline-none focus-visible:border-[#ff6b2b]/50 focus-visible:ring-1 focus-visible:ring-[#ff6b2b]/20 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
