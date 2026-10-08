import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type ShellProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  className?: string;
};

export function AppShell({ children, className, ...props }: ShellProps) {
  return (
    <main className={cn("min-h-dvh bg-surface-canvas text-ink-primary", className)} {...props}>
      {children}
    </main>
  );
}

export function AuthShell({ children }: ShellProps) {
  return (
    <AppShell className="relative grid place-items-center overflow-hidden bg-[radial-gradient(circle_at_top,#dff4ff_0%,#ffffff_42%,#f7fbff_100%)] px-4 py-8">
      <div className="pointer-events-none absolute -left-20 top-12 h-56 w-56 rounded-full bg-sky-200/35 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-10 h-64 w-64 rounded-full bg-teal-200/25 blur-3xl" />
      <div className="relative w-full max-w-md motion-safe:motion-fade-in">{children}</div>
    </AppShell>
  );
}
