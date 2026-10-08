import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AnimatedToastStack, useAnimatedToasts } from "@/components/ui/animated-toast-stack";

function ToastHarness() {
  const { showToast, toasts } = useAnimatedToasts();
  return (
    <>
      <button onClick={() => showToast("Готово", "success")} type="button">
        Показать
      </button>
      <AnimatedToastStack toasts={toasts} />
    </>
  );
}

describe("AnimatedToastStack", () => {
  it("renders toast messages from the hook", async () => {
    render(<ToastHarness />);
    screen.getByRole("button", { name: "Показать" }).click();
    expect(await screen.findByRole("status")).toHaveTextContent("Готово");
  });
});
