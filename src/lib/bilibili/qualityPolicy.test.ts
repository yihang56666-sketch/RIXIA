import { describe, expect, it } from "vitest";
import { chooseDefaultPlaybackQuality, choosePlaybackQuality, filterBrowserMseQualities, qualityLabel } from "./qualityPolicy";

describe("playback quality policy", () => {
  it("uses the requested quality when the server supports it", () => {
    expect(choosePlaybackQuality(80, [112, 80, 64, 32])).toBe(80);
  });

  it("falls back to the nearest supported lower quality before using a higher one", () => {
    expect(choosePlaybackQuality(80, [112, 64, 32])).toBe(64);
    expect(choosePlaybackQuality(16, [32, 64])).toBe(32);
  });

  it("labels common Bilibili quality codes", () => {
    expect(qualityLabel(80)).toBe("1080P");
    expect(qualityLabel(64)).toBe("720P");
  });

  it("uses the mobile default only on a cellular connection", () => {
    const preferences = { wifiDefaultQuality: 80, mobileDefaultQuality: 32 };
    expect(chooseDefaultPlaybackQuality(preferences, "cellular")).toBe(32);
    expect(chooseDefaultPlaybackQuality(preferences, "wifi")).toBe(80);
    expect(chooseDefaultPlaybackQuality(preferences, undefined)).toBe(80);
  });

  it("hides 4K and higher from the browser MSE quality list", () => {
    expect(filterBrowserMseQualities([127, 120, 80, 64, 32])).toEqual([80, 64, 32]);
    expect(filterBrowserMseQualities([116, 80, 64])).toEqual([116, 80, 64]);
  });

  it("keeps the original list when only 4K-class qualities are offered", () => {
    expect(filterBrowserMseQualities([120, 127])).toEqual([127, 120]);
  });
});
