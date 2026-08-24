import { describe, expect, it } from "vitest";
import { createDiagnosticsService } from "./diagnosticsService";

describe("DiagnosticsService", () => {
  it("stores a redacted rolling list of recent runtime errors", () => {
    const storage = new Map<string, string>();
    const service = createDiagnosticsService({
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    });

    service.record(new Error("请求失败 https://example.com/path?SESSDATA=secret"), "runtime");

    expect(service.list()).toEqual([expect.objectContaining({
      message: "请求失败 https://example.com/path",
      source: "runtime",
    })]);
  });
});
