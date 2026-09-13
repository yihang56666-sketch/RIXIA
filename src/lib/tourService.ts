/**
 * 首次功能巡览持久化 — 使用 localStorage 记录已完成的引导步骤。
 * 轻量实现：不依赖服务端，进度与"跳过"都保存在本机。
 */

const TOUR_STORAGE_KEY = "rixia_feature_tour_v1";

export interface TourState {
  completedSteps: number[];
  dismissed: boolean;
  updatedAt: string;
}

export interface TourService {
  load(): TourState;
  completeStep(step: number): TourState;
  dismiss(): TourState;
  isFinished(state: TourState, totalSteps: number): boolean;
}

function emptyState(): TourState {
  return { completedSteps: [], dismissed: false, updatedAt: "" };
}

export function createTourService(storage: Storage = localStorage): TourService {
  function load(): TourState {
    try {
      const raw = storage.getItem(TOUR_STORAGE_KEY);
      if (!raw) return emptyState();
      const parsed = JSON.parse(raw) as Partial<TourState>;
      const completedSteps = Array.isArray(parsed.completedSteps)
        ? parsed.completedSteps.filter((step): step is number => Number.isInteger(step) && step >= 0)
        : [];
      return {
        completedSteps,
        dismissed: parsed.dismissed === true,
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
      };
    } catch {
      return emptyState();
    }
  }

  function save(state: TourState): TourState {
    const next: TourState = { ...state, updatedAt: new Date().toISOString() };
    try {
      storage.setItem(TOUR_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 存储不可用时只保留内存状态，不让引导崩溃。
    }
    return next;
  }

  return {
    load,
    completeStep(step) {
      const state = load();
      if (!state.completedSteps.includes(step)) state.completedSteps.push(step);
      return save(state);
    },
    dismiss() {
      return save({ ...load(), dismissed: true });
    },
    isFinished(state, totalSteps) {
      return state.dismissed || state.completedSteps.length >= totalSteps;
    },
  };
}
