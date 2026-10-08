import { useEffect, useState } from "react";

/** Bottom inset when the on-screen keyboard shrinks visualViewport. */
export function useVisualViewportInset() {
  const [bottomInset, setBottomInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) {
      return;
    }

    function updateInset() {
      if (!viewport) {
        return;
      }
      const gap = window.innerHeight - viewport.height - viewport.offsetTop;
      setBottomInset(Math.max(0, Math.round(gap)));
    }

    updateInset();
    viewport.addEventListener("resize", updateInset);
    viewport.addEventListener("scroll", updateInset);
    window.addEventListener("orientationchange", updateInset);

    return () => {
      viewport.removeEventListener("resize", updateInset);
      viewport.removeEventListener("scroll", updateInset);
      window.removeEventListener("orientationchange", updateInset);
    };
  }, []);

  return bottomInset;
}
