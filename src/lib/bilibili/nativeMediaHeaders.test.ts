import { describe, expect, it } from "vitest";
import { nativeMediaRequestHeaders } from "./nativeMediaHeaders";

describe("nativeMediaRequestHeaders", () => {
  it("uses the video page referer and disables gzip for DASH media", () => {
    expect(nativeMediaRequestHeaders("BV1GJ411x7h7")).toMatchObject({
      Accept: "*/*",
      "Accept-Encoding": "identity",
      Origin: "https://www.bilibili.com",
      Referer: "https://www.bilibili.com/video/BV1GJ411x7h7/",
    });
  });

  it("attaches a logged-in SESSDATA cookie to media requests", () => {
    expect(nativeMediaRequestHeaders("BV1GJ411x7h7", "SESSDATA=abc; bili_jct=def").Cookie)
      .toBe("SESSDATA=abc; bili_jct=def");
    expect(nativeMediaRequestHeaders("BV1GJ411x7h7", "buvid3=only")).not.toHaveProperty("Cookie");
  });
});
