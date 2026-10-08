import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type ToastVariant = "info" | "success" | "error";

type ToastProps = HTMLAttributes<HTMLDivElement> & {
  variant?: ToastVariant;
};

const variants: Record<ToastVariant, string> = {
  error: "border-rose-200 bg-white text-accent-rose",
  info: "border-sky-100 bg-white text-ink-primary",
  success: "border-teal-200 bg-white text-accent-teal",
};

export function Toast({ className, variant = "info", ...props }: ToastProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3 text-sm font-semibold shadow-2xl shadow-sky-950/18 motion-safe:motion-fade-in",
        variants[variant],
        className,
      )}
      role="status"
      {...props}
    />
  );
}

export function ToastRegion({ children }: { children: ReactNode }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-[min(92vw,28rem)] -translate-x-1/2 flex-col gap-2 md:left-auto md:right-4 md:translate-x-0"
    >
      {children}
    </div>
  );
}
