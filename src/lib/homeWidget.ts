import { Capacitor, registerPlugin } from "@capacitor/core";

export interface NativeHomeWidgetPlugin {
  syncState(input: {
    focusedMinutes: number;
    completedCount: number;
    continueTitle: string;
  }): Promise<{ synced?: boolean }>;
}

// Capacitor warns when the same plugin name is registered from multiple modules.
// Keep one shared bridge for the dashboard and any future widget hosts.
export const nativeHomeWidget = registerPlugin<NativeHomeWidgetPlugin>("BeidWidget");

export interface HomeWidgetSnapshot {
  focusedMinutes: number;
  completedCount: number;
  continueTitle?: string;
}

/**
 * Pushes today's focus snapshot to the Android home-screen widget so the
 * widget shows live numbers instead of stale ones. No-op off-device.
 */
export async function syncHomeWidgetState(snapshot: HomeWidgetSnapshot): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await nativeHomeWidget.syncState({
      focusedMinutes: Math.max(0, Math.round(snapshot.focusedMinutes)),
      completedCount: Math.max(0, Math.round(snapshot.completedCount)),
      continueTitle: snapshot.continueTitle ?? "",
    });
  } catch (error) {
    console.warn("[home-widget] sync failed", error);
  }
}
