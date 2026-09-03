import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./useAppStore";

describe("resource collection", () => {
  beforeEach(() => {
    useAppStore.getState().resetAll();
  });

  it("stores a protected cloud link for in-app viewing", () => {
    const resource = useAppStore.getState().addResource("https://pan.quark.cn/s/example", "高数课程");

    expect(resource).toMatchObject({
      title: "高数课程",
      source: "quark",
      url: "https://pan.quark.cn/s/example",
      status: "saved",
    });
    expect(useAppStore.getState().resources).toHaveLength(1);
    expect(useAppStore.getState().addResource("https://pan.quark.cn/s/example", "重复")).toBeNull();
  });
});
