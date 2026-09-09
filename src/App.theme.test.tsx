import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { useAppStore } from "./store/useAppStore";

vi.mock("./features/bilibili/FirstLaunchGate", () => ({
  FirstLaunchGate: () => null,
}));

describe("App system theme", () => {
  let systemDark = true;
  let listeners: Set<() => void>;

  beforeEach(() => {
    systemDark = true;
    listeners = new Set();
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      get matches() { return systemDark; },
      media: "(prefers-color-scheme: dark)",
      addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
    })));
    useAppStore.setState({ theme: "system" });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("uses the current OS preference for Material controls and native form fields", () => {
    render(<App />);
    expect(document.documentElement.dataset.theme).toBe("system");
    expect(document.documentElement.dataset.m3Mode).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("updates when the OS preference changes without reloading the app", () => {
    render(<App />);
    act(() => {
      systemDark = false;
      listeners.forEach((listener) => listener());
    });
    expect(document.documentElement.dataset.m3Mode).toBe("light");
    act(() => {
      systemDark = true;
      listeners.forEach((listener) => listener());
    });
    expect(document.documentElement.dataset.m3Mode).toBe("dark");
  });

  it("keeps explicit themes independent and removes the OS subscription", () => {
    const mounted = render(<App />);
    expect(listeners.size).toBe(1);
    act(() => useAppStore.setState({ theme: "sage" }));
    expect(listeners.size).toBe(0);
    expect(document.documentElement.dataset.m3Mode).toBe("light");
    act(() => useAppStore.setState({ theme: "graphite" }));
    expect(document.documentElement.dataset.m3Mode).toBe("dark");
    act(() => useAppStore.setState({ theme: "system" }));
    expect(listeners.size).toBe(1);
    mounted.unmount();
    expect(listeners.size).toBe(0);
  });
});
