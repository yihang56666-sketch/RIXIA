import { describe, expect, it, vi } from "vitest";
import { createFocusNotificationService } from "./focusNotifications";

describe("focus notification service", () => {
  it("normalizes reminder payloads and forwards them to the native bridge", async () => {
    const plugin = {
      scheduleReminder: vi.fn().mockResolvedValue({ scheduled: true }),
      cancelReminder: vi.fn().mockResolvedValue(undefined),
      showFocusCompleted: vi.fn().mockResolvedValue(undefined),
    };
    const service = createFocusNotificationService(plugin);

    const triggerAtMs = Date.now() + 60_000.123;
    await service.scheduleReminder({ id: " session-1 ", title: " 继续学习 ", triggerAtMs, reason: " 休息结束 " });
    expect(plugin.scheduleReminder).toHaveBeenCalledWith({
      id: "session-1",
      title: "继续学习",
      triggerAtMs: Math.round(triggerAtMs),
      reason: "休息结束",
    });
  });

  it("uses the browser notification fallback when no native bridge exists", async () => {
    const NotificationCtor = vi.fn();
    Object.defineProperty(globalThis, "Notification", {
      configurable: true,
      value: Object.assign(NotificationCtor, { permission: "granted" }),
    });
    const service = createFocusNotificationService();
    await service.showFocusCompleted("完成专注", "25 分钟");
    expect(NotificationCtor).toHaveBeenCalledWith("完成专注", { body: "25 分钟", tag: "focubili-focus-complete" });
  });
});
