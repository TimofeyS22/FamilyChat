import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  className?: string;
};

export function EmptyState({ className, description, icon, title }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center p-6 text-center", className)}>
      {icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-surface-line bg-surface-raised text-ink-secondary">
          {icon}
        </div>
      ) : null}
      <h2 className="text-base font-semibold text-ink-primary">{title}</h2>
      {description ? (
        <p className="mt-2 max-w-sm text-sm leading-6 text-ink-secondary">{description}</p>
      ) : null}
    </div>
  );
}
