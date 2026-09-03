import { describe, expect, it } from "vitest";
import { identifyResourceSource, isProtectedCloudSource, normalizeResourceLink } from "./resourceSources";

describe("resource sources", () => {
  it("identifies supported cloud links", () => {
    expect(identifyResourceSource("https://pan.quark.cn/s/abc")).toBe("quark");
    expect(identifyResourceSource("https://pan.baidu.com/s/abc")).toBe("baidu");
    expect(identifyResourceSource("https://www.bilibili.com/video/BV1GJ411x7h7")).toBe("bilibili");
  });
  it("rejects insecure links and marks cloud links as protected", () => {
    expect(identifyResourceSource("http://example.com/video.mp4")).toBeNull();
    expect(isProtectedCloudSource("quark")).toBe(true);
    expect(isProtectedCloudSource("direct")).toBe(false);
  });
  it("rejects plaintext http even for known cloud hosts carrying share codes", () => {
    expect(identifyResourceSource("http://pan.baidu.com/s/1abc?pwd=xyz")).toBeNull();
    expect(identifyResourceSource("http://pan.quark.cn/s/abc")).toBeNull();
    expect(normalizeResourceLink("http://pan.baidu.com/s/1abc?pwd=xyz")).toBeNull();
  });
  it("normalizes scheme-less input into an absolute https url for opening", () => {
    expect(normalizeResourceLink("pan.quark.cn/s/abc?pwd=x")).toBe("https://pan.quark.cn/s/abc?pwd=x");
    expect(normalizeResourceLink("  https://pan.baidu.com/s/1abc  ")).toBe("https://pan.baidu.com/s/1abc");
    expect(normalizeResourceLink("javascript:alert(1)")).toBeNull();
    expect(normalizeResourceLink("not a url at all")).toBeNull();
  });
  it("does not treat short identifiers as direct resource links", () => {
    expect(identifyResourceSource("BV1")).toBeNull();
  });
});
