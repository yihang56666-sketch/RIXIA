import { describe, expect, it, vi } from "vitest";
import { captureNodeAsPng, shareImageFile } from "./shareCapture";

describe("shareCapture", () => {
  it("returns null when the browser cannot render the foreignObject image (jsdom has no Image)", async () => {
    const node = document.createElement("div");
    node.getBoundingClientRect = () => ({ width: 100, height: 100, top: 0, left: 0, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    Object.defineProperty(globalThis, "Image", { value: undefined, configurable: true });
    const result = await captureNodeAsPng(node, "test");
    expect(result).toBeNull();
  });

  it("returns false when no image share backend is available", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    const result = await shareImageFile(
      { title: "测试", text: "内容", image: { blob, fileName: "test.png" } },
      {},
    );
    expect(result).toBe(false);
  });

  it("invokes the image share backend when provided", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    const result = await shareImageFile(
      { title: "测试", text: "内容", image: { blob, fileName: "test.png" } },
      { share },
    );
    expect(result).toBe(true);
    expect(share).toHaveBeenCalledWith(expect.objectContaining({
      title: "测试",
      text: "内容",
      files: expect.any(Array),
    }));
    expect(share.mock.calls[0]?.[0].files[0]).toBeInstanceOf(File);
  });
});
