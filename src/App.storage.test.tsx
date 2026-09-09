import { act, cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { useAppStore } from "./store/useAppStore";

vi.mock("./features/bilibili/FirstLaunchGate", () => ({
  FirstLaunchGate: ({ children }: { children: ReactNode }) => children,
}));

describe("App storage write banner", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: false,
      media: "(prefers-color-scheme: dark)",
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })));
    useAppStore.setState({ storageWriteFailed: false, view: "today" });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows a recoverable alert when persistence failed and dismisses it", () => {
    render(<App />);
    expect(screen.queryByRole("alert")).toBeNull();

    act(() => useAppStore.setState({ storageWriteFailed: true }));
    expect(screen.getByRole("alert")).toHaveTextContent("只留在当前会话");

    act(() => screen.getByRole("button", { name: "知道了" }).click());
    expect(useAppStore.getState().storageWriteFailed).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
