import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsView } from "./SettingsView";

const loadStartupCheckEnabled = vi.fn().mockReturnValue(true);
const saveStartupCheckEnabled = vi.fn().mockReturnValue(true);

const save = vi.fn().mockResolvedValue(true);
const saveDanmaku = vi.fn().mockResolvedValue(true);
const saveDoNotDisturbEnabled = vi.fn().mockResolvedValue(true);
const importBackup = vi.fn();
const storeState = {
  theme: "system",
  setTheme: vi.fn(),
  setView: vi.fn(),
  density: "standard",
  setDensity: vi.fn(),
  enabledTools: [],
  toggleTool: vi.fn(),
  backgroundImage: null,
  setBackgroundImage: vi.fn(),
  tasks: [], habits: [], notes: [], countdowns: [], subjects: [], inbox: [],
  focusSessions: [], resources: [], timestampNotes: [], journals: [],
};

vi.mock("../../store/useAppStore", () => ({
  useAppStore: Object.assign(() => storeState, { getState: () => ({ exportBackup: vi.fn(), importBackup }) }),
}));

vi.mock("../../lib/bilibili/services", () => ({
  createPlaybackPreferencesService: () => ({
    load: vi.fn().mockResolvedValue({ doubleTapAction: "toggle", seekBarSkin: "classic", wifiDefaultQuality: 80, mobileDefaultQuality: 64, autoplayNext: false, resumeFromLastPosition: true, defaultQuality: 80, defaultVolume: 1, playbackRate: 1 }),
    save,
  }),
  createDanmakuPreferencesService: () => ({
    load: vi.fn().mockResolvedValue({ enabled: true, opacity: 0.8, fontSize: 22, laneCount: 8, scrollDurationSeconds: 9, displayArea: 0.7, strokeWidth: 2, showScrolling: true, showTop: true, showBottom: true, mergeRepeated: true, blockedKeywords: [] }),
    save: saveDanmaku,
  }),
}));

vi.mock("../../lib/bilibili/focusServices", () => ({
  createFocusPreferencesService: () => ({
    load: vi.fn().mockResolvedValue({ enableDoNotDisturb: false, hasSeenPlayerDoNotDisturbGuide: false, hasSeenBackgroundReminderGuide: false }),
    saveDoNotDisturbEnabled,
  }),
}));

vi.mock("../../lib/bilibili/appUpdatePreferences", () => ({
  createAppUpdatePreferencesService: () => ({ loadStartupCheckEnabled, saveStartupCheckEnabled }),
}));

describe("SettingsView playback preferences", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses an in-app confirmation before importing a backup", async () => {
    render(<SettingsView />);
    const input = document.querySelector('input[type="file"][accept="application/json,.json"]');
    expect(input).not.toBeNull();
    const file = new File([JSON.stringify({ formatVersion: 3, data: {} })], "backup.json", { type: "application/json" });
    fireEvent.change(input!, { target: { files: [file] } });

    expect(await screen.findByRole("alertdialog")).toHaveTextContent("会覆盖当前设备上的全部 BEID 数据");
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(importBackup).not.toHaveBeenCalled();

    fireEvent.change(input!, { target: { files: [file] } });
    fireEvent.click(await screen.findByRole("button", { name: "确认导入" }));
    expect(importBackup).toHaveBeenCalledWith({ formatVersion: 3, data: {} });
  });

  it("loads and saves playback defaults", async () => {
    render(<SettingsView />);

    const resume = await screen.findByRole("switch", { name: "记住上次播放位置" });
    expect(screen.getAllByRole("option", { name: /120/ })).toHaveLength(2);
    expect(screen.queryAllByRole("option", { name: /128/ })).toHaveLength(0);
    expect(resume).toHaveAttribute("aria-checked", "true");
    fireEvent.click(resume);
    fireEvent.change(screen.getByRole("combobox", { name: "双击视频画面行为" }), { target: { value: "seek" } });
    fireEvent.change(screen.getByRole("combobox", { name: "播放进度条皮肤" }), { target: { value: "neon" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Wi-Fi 默认清晰度" }), { target: { value: "64" } });
    fireEvent.change(screen.getByRole("combobox", { name: "移动网络默认清晰度" }), { target: { value: "32" } });
    fireEvent.change(screen.getByRole("combobox", { name: "默认倍速" }), { target: { value: "1.5" } });
    fireEvent.change(screen.getByRole("slider", { name: "默认音量" }), { target: { value: "0.6" } });

    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({
      resumeFromLastPosition: false,
      doubleTapAction: "seek",
      seekBarSkin: "neon",
      wifiDefaultQuality: 64,
      mobileDefaultQuality: 32,
      playbackRate: 1.5,
      defaultVolume: 0.6,
    })));
  });

  it("loads and saves global danmaku display preferences", async () => {
    render(<SettingsView />);

    expect(await screen.findByRole("heading", { name: "弹幕显示" })).toBeInTheDocument();
    const opacity = screen.getByRole("slider", { name: "弹幕不透明度" });
    expect(opacity).toHaveValue("0.8");

    fireEvent.change(opacity, { target: { value: "0.5" } });
    fireEvent.click(screen.getByRole("switch", { name: "顶部弹幕" }));
    fireEvent.change(screen.getByRole("textbox", { name: "弹幕屏蔽词" }), { target: { value: "剧透, 刷屏" } });

    await waitFor(() => expect(saveDanmaku).toHaveBeenLastCalledWith(expect.objectContaining({
      opacity: 0.5,
      showTop: false,
      blockedKeywords: ["剧透", "刷屏"],
    })));
  });

  it("saves the focus do-not-disturb preference", async () => {
    render(<SettingsView />);

    const toggle = await screen.findByRole("switch", { name: "专注时启用勿扰" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);

    await waitFor(() => expect(saveDoNotDisturbEnabled).toHaveBeenCalledWith(true));
  });

  it("lets the user opt out of startup update checks", async () => {
    render(<SettingsView />);

    const toggle = await screen.findByRole("switch", { name: "启动时检查更新" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);
    expect(saveStartupCheckEnabled).toHaveBeenCalledWith(false);
  });

  it("returns to personalization from the appearance page", async () => {
    render(<SettingsView />);
    expect(await screen.findByRole("heading", { name: "外观、密度与备份" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "工具页模块" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "返回个性化设置" }));
    expect(storeState.setView).toHaveBeenCalledWith("personalization");
  });
});
