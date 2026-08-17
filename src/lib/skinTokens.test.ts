import { describe, expect, it } from "vitest";
import { THEMES } from "../catalog";
import { GLOBAL_CSS_SNIPPET } from "../test/skinTokens.fixture";

describe("skin tokens match catalog", () => {
  it("every THEMES key has a matching :root[data-theme] selector in CSS", () => {
    const missing: string[] = [];
    for (const theme of THEMES) {
      const selector = `:root[data-theme="${theme.key}"]`;
      if (!GLOBAL_CSS_SNIPPET.includes(selector)) missing.push(theme.key);
    }
    expect(missing, `missing CSS selectors for: ${missing.join(", ")}`).toEqual([]);
  });

  it("no legacy skin keys remain in CSS", () => {
    const legacy = ["paper", "mist", "matcha", "sunset", "dusk", "deep"];
    for (const key of legacy) {
      expect(
        GLOBAL_CSS_SNIPPET,
        `legacy key "${key}" still present in CSS`,
      ).not.toContain(`data-theme="${key}"`);
    }
  });

  it("every THEMES entry defines a dark flag consistent with color-scheme", () => {
    for (const theme of THEMES) {
      if (theme.key === "system") continue;
      const parts = GLOBAL_CSS_SNIPPET.split(`:root[data-theme="${theme.key}"]`);
      if (parts.length < 2) continue;
      const block = parts[1] ?? "";
      const slice = block.slice(0, 400);
      if (theme.dark) {
        expect(slice, `${theme.key} should be dark`).toContain("color-scheme: dark");
      } else {
        expect(slice, `${theme.key} should be light`).toContain("color-scheme: light");
      }
    }
  });
});
