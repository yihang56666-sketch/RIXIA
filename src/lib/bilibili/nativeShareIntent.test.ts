import { describe, expect, it, vi } from "vitest";
import { attachNativeShareIntent } from "./nativeShareIntent";

describe("attachNativeShareIntent", () => {
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
