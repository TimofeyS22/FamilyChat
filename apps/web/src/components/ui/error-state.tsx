import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils/cn";

type ErrorStateProps = {
  message?: string;
  className?: string;
};

export function ErrorState({
  className,
  message = "Something went wrong. Please try again.",
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-accent-rose/35 bg-accent-rose/10 p-3 text-sm text-accent-rose",
        className,
      )}
      role="alert"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
