import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";
import { motionPress, motionSurface } from "@/lib/motion/classes";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
};

export function IconButton({ className, label, children, type = "button", ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-transparent text-ink-secondary focus:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-45",
        motionSurface,
        motionPress,
        "hover:border-surface-line hover:bg-surface-raised hover:text-ink-primary",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
