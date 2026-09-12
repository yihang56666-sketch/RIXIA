/**
 * 专注引导弹窗 — 复刻 FocuBili：
 * - player_focus_onboarding.dart（62 行，首次播放器专注说明勿扰边界）
 * - focus_reminder_background_guide.dart（60 行，小米后台自启动引导）
 *
 * 两者都是"显示一次 + 引导去设置"的轻量引导，数据持久化在 FocusPreferencesStorageService。
 */

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { createFocusPreferencesService } from "../../lib/bilibili/focusServices";
import { nativeFocusNotification } from "../../lib/focusNotifications";
import { M3Dialog, Mi } from "./m3";
import { useAppStore } from "../../store/useAppStore";

export function PlayerFocusDoNotDisturbGuide({ onDismiss }: { onDismiss: () => void }) {
  const [open, setOpen] = useState(true);
  const setView = useAppStore((state) => state.setView);

  // 关闭后经 effect 通知父级：渲染期调用 onDismiss 会在子组件渲染阶段
  // 触发父级 setState（React 明确禁止的反模式）。
  useEffect(() => {
    if (!open) onDismiss();
  }, [open, onDismiss]);

  if (!open) return null;

  const isWindows = Capacitor.getPlatform() === "web" && typeof navigator !== "undefined" && /Win/i.test(navigator.userAgent);
  return (
    <M3Dialog
      icon={<Mi name="do_not_disturb_on" />}
      title={isWindows ? "Windows 系统专注需要手动启动" : "专注时可以自动开启勿扰"}
      onClose={() => setOpen(false)}
      actions={
        <>
          <button className="m3-text-btn" onClick={() => setOpen(false)}>稍后设置</button>
          <button className="m3-filled-btn" onClick={() => { setOpen(false); setView("personalization"); }}>前往设置</button>
        </>
      }
    >
      {isWindows
        ? "Windows 自动启动系统专注需要微软单独授权。你可以在“我的 → 设置 → 个性化设置”中开启开始提醒，之后从 Windows“时钟”手动启动。"
        : "你可以在“我的 → 设置 → 个性化设置”中开启专注勿扰。开启后，专注视频播放时进入勿扰，暂停或结束时恢复；快进、快退不会反复切换。"}
    </M3Dialog>
  );
}

export function FocusReminderBackgroundGuide({ onDismiss }: { onDismiss: () => void }) {
  const [open, setOpen] = useState(true);
  const setView = useAppStore((state) => state.setView);

  useEffect(() => {
    if (!open) onDismiss();
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <M3Dialog
      icon={<Mi name="notifications_active" />}
      title="开启后台提醒保护"
      onClose={() => setOpen(false)}
      actions={
        <>
          <button className="m3-text-btn" onClick={() => setOpen(false)}>稍后处理</button>
          <button className="m3-filled-btn" onClick={() => { setOpen(false); setView("android-permissions"); }}>权限管理</button>
        </>
      }
    >
      小米/HyperOS 在划掉多任务后台后，只有开启“后台自启动”并把电量策略设为“无限制”，才会允许 BEID 在提醒时间重新启动接收器。请到统一权限管理页完成检查。
    </M3Dialog>
  );
}

/**
 * 首次在播放器内开始专注时显示勿扰引导（只显示一次）。
 * 对齐 showPlayerFocusDoNotDisturbGuideIfNeeded。
 */
export function usePlayerFocusDoNotDisturbGuide(active: boolean): { visible: boolean; dismiss: () => void } {
  const [visible, setVisible] = useState(false);
  const service = createFocusPreferencesService();

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void service.load().then((prefs) => {
      if (cancelled || prefs.hasSeenPlayerDoNotDisturbGuide) return;
      void service.markPlayerDoNotDisturbGuideSeen();
      setVisible(true);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return { visible, dismiss: () => setVisible(false) };
}

/**
 * 首次成功设置提醒后，若设备需要后台自启动引导则显示一次。
 * 对齐 showFocusReminderBackgroundGuideIfNeeded。
 */
export function useFocusReminderBackgroundGuide(active: boolean): { visible: boolean; dismiss: () => void } {
  const [visible, setVisible] = useState(false);
  const service = createFocusPreferencesService();
  const isAndroid = Capacitor.getPlatform() === "android";

  useEffect(() => {
    if (!active || !isAndroid) return;
    let cancelled = false;
    void service.load().then(async (prefs) => {
      if (cancelled || prefs.hasSeenBackgroundReminderGuide) return;
      const overview = nativeFocusNotification.getOverview ? await nativeFocusNotification.getOverview() : null;
      const requiresGuide = (overview as { requiresAutostartGuide?: boolean } | null)?.requiresAutostartGuide === true;
      if (cancelled || !requiresGuide) return;
      void service.markBackgroundReminderGuideSeen();
      setVisible(true);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, isAndroid]);

  return { visible, dismiss: () => setVisible(false) };
}
