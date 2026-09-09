import { afterEach, describe, expect, it, vi } from "vitest";
import { attachNativeShareIntent } from "./nativeShareIntent";

describe("attachNativeShareIntent", () => {
  afterEach(() => vi.restoreAllMocks());

  it("removes the listener when the pending query rejects", async () => {
    const failure = new Error("pending unavailable");
    const remove = vi.fn().mockResolvedValue(undefined);
    const plugin = { addListener: vi.fn().mockResolvedValue({ remove }), getPendingText: vi.fn().mockRejectedValue(failure) };

    await expect(attachNativeShareIntent(plugin, vi.fn())).rejects.toBe(failure);
    expect(remove).toHaveBeenCalledOnce();
  });

  it("aborts a hanging pending query immediately and suppresses late shares", async () => {
    const controller = new AbortController();
    let releasePending!: (payload: { text?: string }) => void;
    const onShare = vi.fn();
    const remove = vi.fn().mockResolvedValue(undefined);
    const plugin = {
      addListener: vi.fn().mockResolvedValue({ remove }),
      getPendingText: vi.fn(() => new Promise<{ text?: string }>((resolve) => { releasePending = resolve; })),
    };
    const outcome = attachNativeShareIntent(plugin, onShare, controller.signal).catch((error: unknown) => error);
    await vi.waitFor(() => expect(plugin.getPendingText).toHaveBeenCalledOnce());

    controller.abort();
    await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce());
    await expect(outcome).resolves.toMatchObject({ name: "AbortError" });
    plugin.addListener.mock.calls[0]![1]({ text: "late event" });
    releasePending({ text: "late pending" });
    await Promise.resolve();
    expect(onShare).not.toHaveBeenCalled();
  });

  it("removes a late listener registration after abort without querying pending text", async () => {
    const controller = new AbortController();
    const remove = vi.fn().mockResolvedValue(undefined);
    let releaseListener!: (listener: { remove: typeof remove }) => void;
    const plugin = {
      addListener: vi.fn(() => new Promise<{ remove: typeof remove }>((resolve) => { releaseListener = resolve; })),
      getPendingText: vi.fn().mockResolvedValue({ text: "pending" }),
    };
    const onShare = vi.fn();
    const outcome = attachNativeShareIntent(plugin, onShare, controller.signal).catch((error: unknown) => error);
    controller.abort();
    await expect(outcome).resolves.toMatchObject({ name: "AbortError" });
    releaseListener({ remove });

    await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce());
    await expect(outcome).resolves.toMatchObject({ name: "AbortError" });
    expect(plugin.getPendingText).not.toHaveBeenCalled();
    expect(onShare).not.toHaveBeenCalled();
  });

  it("does not register a listener for an already aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const plugin = { addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }), getPendingText: vi.fn().mockResolvedValue({}) };

    await expect(attachNativeShareIntent(plugin, vi.fn(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(plugin.addListener).not.toHaveBeenCalled();
  });

  it("makes explicit cleanup idempotent and suppresses later callbacks", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const onShare = vi.fn();
    const plugin = { addListener: vi.fn().mockResolvedValue({ remove }), getPendingText: vi.fn().mockResolvedValue({}) };
    const detach = await attachNativeShareIntent(plugin, onShare);

    await Promise.all([detach(), detach()]);
    plugin.addListener.mock.calls[0]![1]({ text: "after detach" });
    expect(remove).toHaveBeenCalledOnce();
    expect(onShare).not.toHaveBeenCalled();
  });

  it("reports rejected abort cleanup without an unhandled rejection", async () => {
    const controller = new AbortController();
    const failure = new Error("remove unavailable");
    const report = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const remove = vi.fn().mockRejectedValue(failure);
    const plugin = { addListener: vi.fn().mockResolvedValue({ remove }), getPendingText: vi.fn().mockResolvedValue({}) };
    await attachNativeShareIntent(plugin, vi.fn(), controller.signal);

    controller.abort();

    await vi.waitFor(() => expect(report).toHaveBeenCalledWith("原生分享监听清理失败", failure));
    expect(remove).toHaveBeenCalledOnce();
  });

  it("deduplicates retained cold-start events against pending text", async () => {
    const onShare = vi.fn();
    const remove = vi.fn().mockResolvedValue(undefined);
    const plugin = {
      addListener: vi.fn(async (_event: string, listener: (payload: { text?: string }) => void) => {
        listener({ text: "cold start" });
        return { remove };
      }),
      getPendingText: vi.fn().mockResolvedValue({ text: "cold start" }),
    };

    const detach = await attachNativeShareIntent(plugin, onShare);

    expect(onShare).toHaveBeenCalledExactlyOnceWith("cold start");
    await detach();
  });

  it("preserves both setup and cleanup errors when pending initialization fails", async () => {
    const pendingError = new Error("pending unavailable");
    const cleanupError = new Error("remove unavailable");
    const remove = vi.fn().mockRejectedValue(cleanupError);
    const plugin = { addListener: vi.fn().mockResolvedValue({ remove }), getPendingText: vi.fn().mockRejectedValue(pendingError) };

    await expect(attachNativeShareIntent(plugin, vi.fn())).rejects.toMatchObject({
      name: "AggregateError",
      errors: [pendingError, cleanupError],
    });
    expect(remove).toHaveBeenCalledOnce();
  });

  it("reports failed cleanup of a listener that arrives after abort", async () => {
    const controller = new AbortController();
    const failure = new Error("late remove unavailable");
    const report = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const remove = vi.fn().mockRejectedValue(failure);
    let releaseListener!: (listener: { remove: typeof remove }) => void;
    const plugin = {
      addListener: vi.fn(() => new Promise<{ remove: typeof remove }>((resolve) => { releaseListener = resolve; })),
      getPendingText: vi.fn().mockResolvedValue({}),
    };
    const outcome = attachNativeShareIntent(plugin, vi.fn(), controller.signal).catch((error: unknown) => error);
    controller.abort();
    await expect(outcome).resolves.toMatchObject({ name: "AbortError" });
    releaseListener({ remove });

    await vi.waitFor(() => expect(report).toHaveBeenCalledWith("原生分享监听清理失败", failure));
    expect(remove).toHaveBeenCalledOnce();
  });

  it("delivers the cold-start share text after the listener is attached", async () => {
    const onShare = vi.fn();
    const remove = vi.fn();
    const plugin = {
      addListener: vi.fn().mockResolvedValue({ remove }),
      getPendingText: vi.fn().mockResolvedValue({ text: "https://www.bilibili.com/video/BV1GJ411x7h7" }),
    };

    const detach = await attachNativeShareIntent(plugin, onShare);

    expect(plugin.addListener).toHaveBeenCalledWith("shareReceived", expect.any(Function));
    expect(onShare).toHaveBeenCalledWith("https://www.bilibili.com/video/BV1GJ411x7h7");
    await detach();
    expect(remove).toHaveBeenCalledOnce();
  });

  it("delivers share text received after the application is already open", async () => {
    let receive: ((payload: { text?: string }) => void) | undefined;
    const onShare = vi.fn();
    const plugin = {
      addListener: vi.fn().mockImplementation(async (_event: string, listener: (payload: { text?: string }) => void) => {
        receive = listener;
        return { remove: vi.fn() };
      }),
      getPendingText: vi.fn().mockResolvedValue({}),
    };

    await attachNativeShareIntent(plugin, onShare);
    receive?.({ text: "bilibili://video/BV1GJ411x7h7?p=2" });

    expect(onShare).toHaveBeenCalledWith("bilibili://video/BV1GJ411x7h7?p=2");
  });
});
