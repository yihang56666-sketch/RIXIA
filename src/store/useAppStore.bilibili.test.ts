import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./useAppStore";

describe("Bilibili player store", () => {
  beforeEach(() => {
    useAppStore.setState({ activeBilibiliBvid: null, resources: [], view: "focus-dashboard" });
  });

  it("selects the requested video even when it is already in the learning list", () => {
    const store = useAppStore.getState();
    store.addResource("BV1GJ411x7h7", "第一节");
    store.addResource("BV1xx411c7mD", "第二节");

    useAppStore.getState().openBilibiliVideo("BV1GJ411x7h7", "第一节");

    expect(useAppStore.getState()).toMatchObject({
      activeBilibiliBvid: "BV1GJ411x7h7",
      view: "bilibili-player",
    });
  });

  it("opens a pending Bilibili search from the kaoyan workspace", () => {
    useAppStore.getState().openBilibiliSearch("考研英语阅读");
    expect(useAppStore.getState()).toMatchObject({
      view: "search",
      pendingBilibiliSearch: "考研英语阅读",
    });
    useAppStore.getState().consumePendingBilibiliSearch();
    expect(useAppStore.getState().pendingBilibiliSearch).toBeNull();
  });
});
