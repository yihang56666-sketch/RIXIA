import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { FirstLaunchGate } from "./FirstLaunchGate";

describe("FirstLaunchGate", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the app locked until the ten-second agreement countdown ends", async () => {
    render(<FirstLaunchGate><p>主应用</p></FirstLaunchGate>);

    const agree = screen.getByRole("button", { name: /同意并继续/ });
    expect(agree).toBeDisabled();
    expect(screen.queryByText("主应用")).not.toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(10_000); });
    expect(agree).toBeEnabled();
    act(() => { fireEvent.click(agree); });
    expect(screen.getByText("主应用")).toBeInTheDocument();
  });
});
