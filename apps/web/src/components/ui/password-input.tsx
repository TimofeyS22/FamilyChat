"use client";

import { Eye, EyeOff, Lock } from "lucide-react";
import { useState } from "react";
import type { InputHTMLAttributes } from "react";

import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils/cn";

type PasswordInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

export function PasswordInput({ className, error, id, label, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const inputId = id ?? props.name ?? label.toLowerCase().replace(/\s+/g, "-");

  return (
    <label className="block" htmlFor={inputId}>
      <span className="mb-2 block text-sm font-medium text-ink-secondary">{label}</span>
      <span className="relative block">
        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          className={cn(
            "min-h-12 w-full rounded-2xl border border-surface-line bg-surface-canvas px-10 text-sm text-ink-primary outline-none transition placeholder:text-ink-muted focus:border-accent-teal focus:shadow-focus",
            error && "border-accent-rose focus:border-accent-rose",
            className,
          )}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...props}
        />
        <IconButton
          label={visible ? "Hide password" : "Show password"}
          className="absolute right-1 top-1/2 h-10 w-10 -translate-y-1/2 border-transparent"
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </IconButton>
      </span>
      {error ? (
        <span id={`${inputId}-error`} className="mt-2 block text-sm text-accent-rose">
          {error}
        </span>
      ) : null}
    </label>
  );
}
