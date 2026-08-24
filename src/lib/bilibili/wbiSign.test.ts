import { describe, expect, it } from "vitest";
import { signWbiQuery } from "./wbiSign";

describe("signWbiQuery", () => {
  it("appends a stable w_rid for sorted params", () => {
    const query = signWbiQuery({ bvid: "BV1GJ411x7h7", wts: "1700000000" }, "a".repeat(32));
    expect(query).toContain("bvid=BV1GJ411x7h7");
    expect(query).toContain("wts=1700000000");
    expect(query).toMatch(/w_rid=[a-f0-9]{32}$/);
  });
});
