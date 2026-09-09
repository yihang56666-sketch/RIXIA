import { afterEach, describe, expect, it, vi } from "vitest";
import { attachDeepLinkHandler, parseDeepLink } from "./deepLinkService";

describe("deep link input boundaries", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("treats malformed escaped search input as unknown instead of throwing", () => {
    const input = "https://search.bilibili.com/all?keyword=%E0%A4%A";
    expect(parseDeepLink(input)).toEqual({ kind: "unknown", raw: input });
  });

  it("decodes plus signs in search query values", () => {
    expect(parseDeepLink("https://search.bilibili.com/all?keyword=linear+algebra")).toEqual({ kind: "search", keyword: "linear algebra" });
  });

  it("ignores zero and unsafe part identifiers", () => {
    expect(parseDeepLink("https://www.bilibili.com/video/BV1GJ411x7h7?cid=9007199254740993&p=0"))
      .toEqual({ kind: "video", bvid: "BV1GJ411x7h7", cid: undefined, page: undefined });
  });

  it("keeps the hash listener usable after malformed input and validates video identifiers", () => {
    window.history.replaceState(null, "", "/#/search/%E0%A4%A");
    const openSearch = vi.fn();
    const openVideo = vi.fn();
    const detach = attachDeepLinkHandler({ openSearch, openVideo });
    try {
      expect(openSearch).not.toHaveBeenCalled();
      window.history.replaceState(null, "", "/#/video/not-a-bvid?cid=NaN&p=-1");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      expect(openVideo).not.toHaveBeenCalled();
      window.history.replaceState(null, "", "/#/video/BV1GJ411x7h7?cid=NaN&p=2");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      expect(openVideo).toHaveBeenCalledWith("BV1GJ411x7h7", undefined, 2);
    } finally {
      detach();
    }
  });
});
