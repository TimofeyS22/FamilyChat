import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-full border border-surface-line bg-surface-raised px-2.5 text-xs font-semibold text-ink-secondary",
        className,
      )}
      {...props}
    />
  );
}
