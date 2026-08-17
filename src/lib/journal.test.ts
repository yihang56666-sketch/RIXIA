import { describe, expect, it } from "vitest";
import { extractTags, extractWikiLinks } from "./journal";

describe("extractTags", () => {
  it("extracts #tags from markdown text", () => {
    const tags = extractTags("今天 #学习 了 #运动 一下");
    expect(tags).toEqual(["学习", "运动"]);
  });

  it("ignores # inside code spans", () => {
    const tags = extractTags("看 `#ff00ff` 颜色和 #真实标签");
    expect(tags).toEqual(["真实标签"]);
  });

  it("ignores # at start of line (markdown headings)", () => {
    const tags = extractTags("# 标题\n#tag1\n## 另一个\n#tag2");
    expect(tags.sort()).toEqual(["tag1", "tag2"]);
  });

  it("ignores bare # without following text", () => {
    const tags = extractTags("这是 # 而不是标签");
    expect(tags).toEqual([]);
  });

  it("returns unique tags", () => {
    const tags = extractTags("#学习 #学习 #运动");
    expect(tags).toEqual(["学习", "运动"]);
  });

  it("rejects tags containing spaces", () => {
    const tags = extractTags("#多字 标签 #学习");
    expect(tags).toEqual(["多字", "学习"]);
  });
});

describe("extractWikiLinks", () => {
  it("extracts [[link]] from markdown text", () => {
    const links = extractWikiLinks("看 [[读书]] 和 [[运动]] 这两个");
    expect(links).toEqual(["读书", "运动"]);
  });

  it("ignores single [", () => {
    const links = extractWikiLinks("[不是 wiki 链接");
    expect(links).toEqual([]);
  });

  it("returns unique links", () => {
    const links = extractWikiLinks("[[读书]] [[读书]] [[读书]]");
    expect(links).toEqual(["读书"]);
  });

  it("trims whitespace in link text", () => {
    const links = extractWikiLinks("[[ 读书 ]]");
    expect(links).toEqual(["读书"]);
  });

  it("ignores links containing newlines", () => {
    const links = extractWikiLinks("[[读书\n运动]]");
    expect(links).toEqual([]);
  });
});
