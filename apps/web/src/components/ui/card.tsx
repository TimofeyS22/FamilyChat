import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-surface-line bg-surface-panel p-5 motion-safe:motion-slide-up-in",
        className,
      )}
      {...props}
    />
  );
}
