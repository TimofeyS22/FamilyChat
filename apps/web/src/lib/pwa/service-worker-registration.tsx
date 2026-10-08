"use client";

import { useEffect } from "react";

function canRegisterServiceWorker() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  if (!("serviceWorker" in navigator)) {
    return false;
  }
  const host = window.location.hostname;
  return window.isSecureContext || host === "localhost" || host === "127.0.0.1";
}

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!canRegisterServiceWorker()) {
      return;
    }

    let reloadedForControllerChange = false;
    const onControllerChange = () => {
      if (reloadedForControllerChange) {
        return;
      }
      reloadedForControllerChange = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    void navigator.serviceWorker.register("/sw.js").then((registration) => {
      void registration.update();
    }).catch(() => {
      // Registration failure should not break chat access.
    });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
