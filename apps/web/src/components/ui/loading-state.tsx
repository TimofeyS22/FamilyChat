import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils/cn";

type LoadingStateProps = {
  label?: string;
  className?: string;
};

export function LoadingState({ className, label = "Loading" }: LoadingStateProps) {
  return (
    <div className={cn("flex items-center justify-center gap-3 p-6 text-ink-secondary", className)}>
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
