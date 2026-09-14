import { describe, expect, it } from "vitest";
import { FEATURE_MAP_CATEGORIES } from "./featureMapCatalog";

describe("feature map catalog", () => {
  it("groups entries by intent and keeps stable ids", () => {
    expect(FEATURE_MAP_CATEGORIES.map((category) => category.id)).toEqual([
      "watch",
      "focus",
      "review",
      "organize",
      "system",
    ]);
    const ids = FEATURE_MAP_CATEGORIES.flatMap((category) => category.items.map((item) => item.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every entry purpose, route and how-to copy", () => {
    const entries = FEATURE_MAP_CATEGORIES.flatMap((category) => category.items);
    expect(entries.length).toBeGreaterThan(8);
    for (const entry of entries) {
      expect(entry.title).toBeTruthy();
      expect(entry.purpose).toBeTruthy();
      expect(entry.how).toBeTruthy();
      expect(entry.route).toBeTruthy();
    }
  });
});
