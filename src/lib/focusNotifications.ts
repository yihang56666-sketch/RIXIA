export interface FocusReminder {
  id: string;
  title: string;
  triggerAtMs: number;
  reason?: string;
}

export interface NativeFocusNotificationPlugin {
  getOverview?(): Promise<{ notificationAllowed?: boolean; exactAlarmAllowed?: boolean; supportsExactAlarm?: boolean }>;
  requestPermission?(): Promise<{ granted?: boolean }>;
  openSettings?(): Promise<void>;
  openExactAlarmSettings?(): Promise<void>;
  openDoNotDisturbSettings?(): Promise<void>;
  scheduleReminder(input: FocusReminder): Promise<{ scheduled?: boolean }>;
  cancelReminder(input: { id: string }): Promise<void>;
  showFocusCompleted(input: { title: string; body: string }): Promise<void>;
}

// Capacitor warns when the same plugin name is registered from multiple modules.
// Keep one shared bridge for the focus timer and the standalone focus page.
export const nativeFocusNotification = registerPlugin<NativeFocusNotificationPlugin>("BeidFocusNotifications");

export interface FocusNotificationService {
  scheduleReminder(input: FocusReminder): Promise<boolean>;
  cancelReminder(id: string): Promise<void>;
  showFocusCompleted(title: string, body: string): Promise<void>;
}

const browserTimers = new Map<string, ReturnType<typeof setTimeout>>();

function cleanReminder(input: FocusReminder): FocusReminder | null {
  const id = input.id.trim();
  const title = input.title.trim();
  const triggerAtMs = Math.round(input.triggerAtMs);
  if (!id || !title || !Number.isFinite(triggerAtMs) || triggerAtMs <= Date.now()) return null;
  const reason = input.reason?.trim();
  return reason ? { id, title, triggerAtMs, reason } : { id, title, triggerAtMs };
}

function browserSchedule(input: FocusReminder): boolean {
  if (typeof window === "undefined") return false;
  const notification = typeof Notification !== "undefined" && Notification.permission === "granted";
  if (!notification) return false;
  const existing = browserTimers.get(input.id);
  if (existing) clearTimeout(existing);
  const delay = Math.min(Math.max(0, input.triggerAtMs - Date.now()), 2_147_000_000);
  const timer = setTimeout(() => {
    browserTimers.delete(input.id);
    new Notification(input.title, { body: input.reason ?? "回来继续你的专注任务", tag: `focubili-reminder-${input.id}` });
  }, delay);
  browserTimers.set(input.id, timer);
  return true;
}

export function createFocusNotificationService(plugin?: NativeFocusNotificationPlugin): FocusNotificationService {
  return {
    async scheduleReminder(input) {
      const cleaned = cleanReminder(input);
      if (!cleaned) return false;
      if (plugin) {
        const result = await plugin.scheduleReminder(cleaned);
        return result.scheduled !== false;
      }
      return browserSchedule(cleaned);
    },
    async cancelReminder(id) {
      const cleanId = id.trim();
      if (!cleanId) return;
      if (plugin) {
        await plugin.cancelReminder({ id: cleanId });
        return;
      }
      const timer = browserTimers.get(cleanId);
      if (timer) clearTimeout(timer);
      browserTimers.delete(cleanId);
    },
    async showFocusCompleted(title, body) {
      const cleanTitle = title.trim();
      const cleanBody = body.trim();
      if (!cleanTitle || !cleanBody) return;
      if (plugin) {
        await plugin.showFocusCompleted({ title: cleanTitle, body: cleanBody });
        return;
      }
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(cleanTitle, { body: cleanBody, tag: "focubili-focus-complete" });
      }
    },
  };
}
import { registerPlugin } from "@capacitor/core";
