import { describe, expect, it } from "vitest";
import { GLOBAL_CSS_SNIPPET } from "../test/skinTokens.fixture";

describe("custom background overlay", () => {
  it("does not blur the content layer on Android WebView", () => {
    const block = GLOBAL_CSS_SNIPPET.match(
      /\.app-background\[data-has-background=\"true\"\] \.app-overlay\s*\{([\s\S]*?)\n\}/,
    )?.[1];

    expect(block).toBeTruthy();
    expect(block).not.toMatch(/backdrop-filter\s*:/);
    expect(block).not.toMatch(/-webkit-backdrop-filter\s*:/);
  });
});
