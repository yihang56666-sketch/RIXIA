import { describe, expect, it } from "vitest";
import { isAllowedBiliMediaHost, rankMediaSourceUrls } from "./mediaHostPolicy";

describe("isAllowedBiliMediaHost", () => {
  it("allows official Bilibili media CDNs", () => {
    expect(isAllowedBiliMediaHost("upos-sz-mirrorcos.bilivideo.com")).toBe(true);
    expect(isAllowedBiliMediaHost("cn-hbxy-cmcc-v-02.bilivideo.cn")).toBe(true);
    expect(isAllowedBiliMediaHost("i0.hdslb.com")).toBe(true);
    expect(isAllowedBiliMediaHost("upos-hz-mirrorakam.akamaized.net")).toBe(true);
  });

  it("allows known Bilibili mCDN / PCDN partner hosts used in playurl", () => {
    expect(isAllowedBiliMediaHost("b-baacc4vx20dltm107bs0ym4i1a.edge.mountaintoys.cn")).toBe(true);
    expect(isAllowedBiliMediaHost("upos-sz-mirrorbd.szbdyd.com")).toBe(true);
  });

  it("rejects unrelated hosts and suffix spoofs", () => {
    expect(isAllowedBiliMediaHost("evil.com")).toBe(false);
    expect(isAllowedBiliMediaHost("mountaintoys.cn.evil.com")).toBe(false);
    expect(isAllowedBiliMediaHost("notbilivideo.com")).toBe(false);
    expect(isAllowedBiliMediaHost("127.0.0.1")).toBe(false);
    expect(isAllowedBiliMediaHost("localhost")).toBe(false);
  });
});

describe("rankMediaSourceUrls", () => {
  it("prefers official DASH hosts over mCDN and drops unsafe URLs", () => {
    expect(
      rankMediaSourceUrls([
        "https://b-baacc4vx20dltm107bs0ym4i1a.edge.mountaintoys.cn:4483/upgcxcode/video.m4s",
        "https://evil.example/steal.m4s",
        "https://upos-sz-mirrorcos.bilivideo.com/upgcxcode/video.m4s",
        "http://upos-sz-mirrorcos.bilivideo.com/insecure.m4s",
      ]),
    ).toEqual([
      "https://upos-sz-mirrorcos.bilivideo.com/upgcxcode/video.m4s",
      "https://b-baacc4vx20dltm107bs0ym4i1a.edge.mountaintoys.cn:4483/upgcxcode/video.m4s",
    ]);
  });
});
