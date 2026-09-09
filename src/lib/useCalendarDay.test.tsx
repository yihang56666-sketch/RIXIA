import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCalendarDay } from "./useCalendarDay";

function Probe() {
  const today = useCalendarDay();
  return <p>日历 {today}</p>;
}

describe("useCalendarDay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 5, 23, 59, 0));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  it("refreshes the calendar date when the app returns after midnight", () => {
    render(<Probe />);
    expect(screen.getByText("日历 2026-09-05")).toBeInTheDocument();

    act(() => {
      vi.setSystemTime(new Date(2026, 8, 6, 0, 1, 0));
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(screen.getByText("日历 2026-09-06")).toBeInTheDocument();
  });
});
