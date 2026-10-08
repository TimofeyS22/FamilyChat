import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";
import { motionPress, motionSurface } from "@/lib/motion/classes";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent-teal text-slate-950 hover:bg-accent-teal/90 disabled:bg-surface-raised disabled:text-ink-muted",
  secondary:
    "border border-surface-line bg-surface-raised text-ink-primary hover:bg-surface-line/45 disabled:text-ink-muted",
  ghost: "text-ink-secondary hover:bg-surface-raised hover:text-ink-primary disabled:text-ink-muted",
  danger:
    "border border-accent-rose/40 bg-accent-rose/12 text-accent-rose hover:bg-accent-rose/18 disabled:text-ink-muted",
};

export function Button({
  className,
  variant = "primary",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold focus:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-70",
        motionSurface,
        motionPress,
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
