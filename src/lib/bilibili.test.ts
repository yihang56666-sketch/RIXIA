import { describe, expect, it } from "vitest";
import { buildSearchUrl, extractBvid } from "./bilibili";

describe("extractBvid", () => {
  it("extracts a bare bvid", () => {
    expect(extractBvid("BV1GJ411x7h7")).toBe("BV1GJ411x7h7");
  });

  it("extracts a bvid from a full desktop url", () => {
    expect(extractBvid("https://www.bilibili.com/video/BV1GJ411x7h7?p=2")).toBe("BV1GJ411x7h7");
  });

  it("extracts a bvid from a share text", () => {
    expect(extractBvid("【考研数学】全集 https://b23.tv/xxx BV1GJ411x7h7 快看！")).toBe("BV1GJ411x7h7");
  });

  it("returns null for invalid input", () => {
    expect(extractBvid("https://www.bilibili.com/video/av170001")).toBeNull();
    expect(extractBvid("BV123")).toBeNull();
    expect(extractBvid("")).toBeNull();
  });
});

describe("buildSearchUrl", () => {
  it("encodes the keyword", () => {
    expect(buildSearchUrl("考研数学")).toBe(
      "https://search.bilibili.com/all?keyword=%E8%80%83%E7%A0%94%E6%95%B0%E5%AD%A6",
    );
  });
});
