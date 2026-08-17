import type { CourseResource, TimestampNote } from "../../types";
import { createWebLearningProvider } from "./webProvider";
import { createNativeLearningProvider } from "./nativeProvider";
import type { LearningProvider } from "./types";

export type { LearningProvider };

/**
 * 创建当前环境的 LearningProvider：
 * - 若 window.rixiaNativeLearning 存在，使用 native provider
 * - 否则使用 web provider 降级
 * 任何原生调用失败时，调用方可回退到 web provider。
 */
export function createLearningProvider(getStore: () => {
  resources: CourseResource[];
  timestampNotes: TimestampNote[];
}): LearningProvider {
  if (typeof window !== "undefined" && window.rixiaNativeLearning) {
    return createNativeLearningProvider();
  }
  return createWebLearningProvider(getStore);
}
