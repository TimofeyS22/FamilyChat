"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils/cn";

type MotionModalProps = {
  children: ReactNode;
  className?: string;
  onClose: () => void;
  open: boolean;
  panelClassName?: string;
};

export function MotionModal({
  children,
  className,
  onClose,
  open,
  panelClassName,
}: MotionModalProps) {
  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      aria-modal="true"
      className={cn(
        "fixed inset-0 z-40 flex items-end justify-center bg-slate-950/24 p-3 backdrop-blur-md motion-safe:motion-fade-in sm:items-center",
        className,
      )}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
    >
      <div
        className={cn(
          "w-full max-w-md motion-safe:motion-slide-up-in",
          panelClassName,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
