import { afterEach, describe, expect, it } from "vitest";
import { createTourService, type TourState } from "./tourService";

function createMemoryStorage(initial?: Record<string, string>): Storage {
  const data = new Map(Object.entries(initial ?? {}));
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key) {
      return data.get(key) ?? null;
    },
    key(index) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key) {
      data.delete(key);
    },
    setItem(key, value) {
      data.set(key, value);
    },
  };
}

describe("tourService", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("starts empty and finishes after all steps or dismissal", () => {
    const service = createTourService(createMemoryStorage());
    const fresh = service.load();
    expect(fresh.completedSteps).toEqual([]);
    expect(fresh.dismissed).toBe(false);
    expect(service.isFinished(fresh, 5)).toBe(false);

    const completed = service.completeStep(0);
    completed.completedSteps.push(1, 2);
    const resumed = service.load();
    expect(resumed.completedSteps).toEqual([0]);

    for (let step = 1; step < 5; step += 1) {
      service.completeStep(step);
    }
    expect(service.isFinished(service.load(), 5)).toBe(true);

    service.dismiss();
    expect(service.load().dismissed).toBe(true);
    expect(service.isFinished(service.load(), 5)).toBe(true);
  });

  it("does not duplicate completed steps", () => {
    const service = createTourService(createMemoryStorage());
    service.completeStep(2);
    service.completeStep(2);
    expect(service.load().completedSteps).toEqual([2]);
  });

  it("recovers from corrupted storage", () => {
    const raw = '{ "completedSteps": [1, "2", -1, 3.5], "dismissed": "yes" }';
    const storage = createMemoryStorage({ rixia_feature_tour_v1: raw });
    const state = createTourService(storage).load();
    expect(state.completedSteps).toEqual([1]);
    expect(state.dismissed).toBe(false);
  });

  it("keeps working in memory when persistence throws", () => {
    const throwing: Storage = {
      get length() {
        return 0;
      },
      clear() {},
      getItem() {
        return null;
      },
      key() {
        return null;
      },
      removeItem() {},
      setItem() {
        throw new Error("quota exceeded");
      },
    };
    const service = createTourService(throwing);
    expect(service.completeStep(0).completedSteps).toEqual([0]);
  });

  it("stamps an update timestamp when saving", () => {
    const storage = createMemoryStorage();
    const state = createTourService(storage).completeStep(3);
    expect(state.updatedAt).not.toBe("");
    const persisted = JSON.parse(storage.getItem("rixia_feature_tour_v1") ?? "{}") as TourState;
    expect(persisted.completedSteps).toEqual([3]);
  });
});
