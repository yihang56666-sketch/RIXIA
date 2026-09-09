import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { useAppStore } from "./store/useAppStore";
import { createDiagnosticsService } from "./lib/bilibili/diagnosticsService";

const native = vi.hoisted(() => ({
  getLaunchUrl: vi.fn(),
  addListener: vi.fn(),
  attachShare: vi.fn(),
  plugin: {},
}));

vi.mock("@capacitor/core", async (importOriginal) => {
  const original = await importOriginal<typeof import("@capacitor/core")>();
  return {
    ...original,
    Capacitor: {
      ...original.Capacitor,
      isNativePlatform: () => true,
      getPlatform: () => "android",
    },
  };
});
vi.mock("@capacitor/app", () => ({
  App: { getLaunchUrl: native.getLaunchUrl, addListener: native.addListener },
}));
vi.mock("./lib/bilibili/nativeShareIntent", () => ({
  getNativeShareIntent: () => native.plugin,
  attachNativeShareIntent: native.attachShare,
}));
vi.mock("./features/bilibili/FirstLaunchGate", () => ({ FirstLaunchGate: () => null }));

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

async function flushEffects() {
  await act(async () => { await Promise.resolve(); });
}

describe("App native intent ownership", () => {
  let urlListener: (payload: { url: string }) => void;
  let shareListener: (text: string) => void;
  let removeUrl: ReturnType<typeof vi.fn>;
  let detachShare: ReturnType<typeof vi.fn>;
  let openVideo: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    removeUrl = vi.fn().mockResolvedValue(undefined);
    detachShare = vi.fn().mockResolvedValue(undefined);
    native.getLaunchUrl.mockResolvedValue(undefined);
    native.addListener.mockImplementation((_event, listener) => {
      urlListener = listener;
      return Promise.resolve({ remove: removeUrl });
    });
    native.attachShare.mockImplementation((_plugin, listener) => {
      shareListener = listener;
      return Promise.resolve(detachShare);
    });
    useAppStore.setState({ theme: "sage" });
    openVideo = vi.spyOn(useAppStore.getState(), "openBilibiliVideo");
  });

  afterEach(async () => {
    cleanup();
    await flushEffects();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("routes active launch URLs and share events through the real parser", async () => {
    native.getLaunchUrl.mockResolvedValue({ url: "https://www.bilibili.com/video/BV1GJ411x7h7" });
    render(<App />);
    await flushEffects();
    expect(openVideo).toHaveBeenCalledWith("BV1GJ411x7h7");
    openVideo.mockClear();
    shareListener("BV1Q541167Qg");
    await flushEffects();
    expect(openVideo).toHaveBeenCalledWith("BV1Q541167Qg");
  });

  it("does not navigate when the launch URL arrives after unmount", async () => {
    const launch = deferred<{ url: string }>();
    native.getLaunchUrl.mockReturnValue(launch.promise);
    const mounted = render(<App />);
    mounted.unmount();
    launch.resolve({ url: "BV1GJ411x7h7" });
    await flushEffects();
    expect(openVideo).not.toHaveBeenCalled();
  });

  it("suppresses late callbacks and a short-link redirect that finishes after unmount", async () => {
    const redirect = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => redirect.promise));
    const mounted = render(<App />);
    await flushEffects();
    urlListener({ url: "https://b23.tv/intent" });
    mounted.unmount();
    urlListener({ url: "BV1GJ411x7h7" });
    shareListener("BV1Q541167Qg");
    redirect.resolve({ ok: true, url: "https://www.bilibili.com/video/BV1GJ411x7h7" } as Response);
    await flushEffects();
    expect(openVideo).not.toHaveBeenCalled();
    expect(removeUrl).toHaveBeenCalledTimes(1);
    expect(detachShare).toHaveBeenCalledTimes(1);
  });

  it("cleans handles returned after unmount and aborts pending share initialization", async () => {
    const registration = deferred<{ remove: () => Promise<void> }>();
    const shareRegistration = deferred<() => Promise<void>>();
    native.addListener.mockReturnValue(registration.promise);
    native.attachShare.mockReturnValue(shareRegistration.promise);
    const mounted = render(<App />);
    await flushEffects();
    const signal = native.attachShare.mock.calls[0]?.[2] as AbortSignal | undefined;
    mounted.unmount();
    registration.resolve({ remove: removeUrl });
    shareRegistration.resolve(detachShare);
    await flushEffects();
    expect(signal?.aborted).toBe(true);
    expect(removeUrl).toHaveBeenCalledTimes(1);
    expect(detachShare).toHaveBeenCalledTimes(1);
  });

  it("records rejected native setup and cleanup instead of leaking rejections", async () => {
    native.getLaunchUrl.mockRejectedValue(new Error("launch unavailable"));
    native.attachShare.mockRejectedValue(new Error("share unavailable"));
    removeUrl.mockRejectedValue(new Error("remove unavailable"));
    const mounted = render(<App />);
    await flushEffects();
    mounted.unmount();
    await flushEffects();
    expect(createDiagnosticsService().list().map((entry) => entry.message)).toEqual(
      expect.arrayContaining(["launch unavailable", "share unavailable", "remove unavailable"]),
    );
  });

  it("records a rejected URL listener registration", async () => {
    native.addListener.mockRejectedValue(new Error("registration unavailable"));
    render(<App />);
    await flushEffects();
    expect(createDiagnosticsService().list().some((entry) => entry.message === "registration unavailable")).toBe(true);
  });
});
