import { describe, expect, it } from "vitest";
import { getDailyQuote } from "./dailyQuotes";

describe("getDailyQuote", () => {
  it("returns a complete quote with text and source", () => {
    const quote = getDailyQuote("2026-09-13");

    expect(quote.text.trim().length).toBeGreaterThan(0);
    expect(quote.source.trim().length).toBeGreaterThan(0);
  });

  it("returns the same quote for the same date", () => {
    expect(getDailyQuote("2026-09-13")).toEqual(getDailyQuote("2026-09-13"));
  });

  it("rotates through multiple quotes instead of one fixed sentence", () => {
    const dates = Array.from({ length: 40 }, (_, index) => {
      const day = 13 + index;
      return `2026-09-${String(day).padStart(2, "0")}`;
    });
    const unique = new Set(dates.map((date) => getDailyQuote(date).text));

    expect(unique.size).toBeGreaterThan(1);
  });
});
