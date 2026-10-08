import type { InputHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  icon?: ReactNode;
};

export function Input({ className, error, icon, id, label, ...props }: InputProps) {
  const inputId = id ?? props.name ?? label.toLowerCase().replace(/\s+/g, "-");

  return (
    <label className="block" htmlFor={inputId}>
      <span className="mb-2 block text-sm font-medium text-ink-secondary">{label}</span>
      <span className="relative block">
        {icon ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">
            {icon}
          </span>
        ) : null}
        <input
          id={inputId}
          className={cn(
            "min-h-12 w-full rounded-2xl border border-surface-line bg-surface-canvas px-3 text-sm text-ink-primary outline-none transition-[border-color,box-shadow,background-color] duration-micro ease-standard placeholder:text-ink-muted focus:border-accent-teal focus:shadow-focus",
            icon && "pl-10",
            error && "border-accent-rose focus:border-accent-rose",
            className,
          )}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...props}
        />
      </span>
      {error ? (
        <span id={`${inputId}-error`} className="mt-2 block text-sm text-accent-rose">
          {error}
        </span>
      ) : null}
    </label>
  );
}
