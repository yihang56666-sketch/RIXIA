import { describe, expect, it } from "vitest";
import { normalizeBiliImageUrl, normalizeBiliThumbnailUrl } from "./imageUrl";

describe("normalizeBiliImageUrl", () => {
  it("upgrades protocol-relative and http hdslb covers to https", () => {
    expect(normalizeBiliImageUrl("//i0.hdslb.com/bfs/archive/a.jpg")).toBe("https://i0.hdslb.com/bfs/archive/a.jpg");
    expect(normalizeBiliImageUrl("http://i0.hdslb.com/bfs/archive/a.jpg")).toBe("https://i0.hdslb.com/bfs/archive/a.jpg");
  });

  it("rejects untrusted hosts", () => {
    expect(normalizeBiliImageUrl("https://evil.example/a.jpg")).toBe("");
    expect(normalizeBiliImageUrl("not a url")).toBe("");
  });
});

describe("normalizeBiliThumbnailUrl", () => {
  it("appends a compact webp suffix for list covers", () => {
    expect(normalizeBiliThumbnailUrl("http://i0.hdslb.com/bfs/archive/a.jpg")).toBe(
      "https://i0.hdslb.com/bfs/archive/a.jpg@320w_200h_1c.webp",
    );
  });
});
