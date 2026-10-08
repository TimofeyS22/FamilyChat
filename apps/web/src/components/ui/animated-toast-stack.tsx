"use client";

import { useCallback, useRef, useState } from "react";

import { transitionPanel } from "@/lib/motion/classes";
import { cn } from "@/lib/utils/cn";

import { Toast, ToastRegion } from "./toast";

export type AnimatedToastVariant = "info" | "success" | "error";

type AnimatedToastItem = {
  id: number;
  message: string;
  phase: "enter" | "idle" | "exit";
  variant: AnimatedToastVariant;
};

export function useAnimatedToasts() {
  const [toasts, setToasts] = useState<AnimatedToastItem[]>([]);
  const toastIdRef = useRef(0);

  const showToast = useCallback((message: string, variant: AnimatedToastVariant = "info") => {
    const id = ++toastIdRef.current;
    setToasts((current) => [...current.slice(-2), { id, message, phase: "enter", variant }]);
    window.requestAnimationFrame(() => {
      setToasts((current) =>
        current.map((toast) => (toast.id === id ? { ...toast, phase: "idle" } : toast)),
      );
    });
    const exitTimer = window.setTimeout(() => {
      setToasts((current) =>
        current.map((toast) => (toast.id === id ? { ...toast, phase: "exit" } : toast)),
      );
    }, 2900);
    const removeTimer = window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3200);
    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  return { showToast, toasts };
}

export function AnimatedToastStack({ toasts }: { toasts: AnimatedToastItem[] }) {
  return (
    <ToastRegion>
      {toasts.map((toast) => (
        <Toast
          className={cn(
            "pointer-events-auto",
            transitionPanel,
            toast.phase === "enter" && "translate-y-2 opacity-0",
            toast.phase === "idle" && "translate-y-0 opacity-100",
            toast.phase === "exit" && "translate-y-1 opacity-0",
          )}
          key={toast.id}
          variant={toast.variant}
        >
          {toast.message}
        </Toast>
      ))}
    </ToastRegion>
  );
}
