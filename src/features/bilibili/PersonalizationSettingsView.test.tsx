import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PersonalizationSettingsView } from "./PersonalizationSettingsView";
import { useAppStore } from "../../store/useAppStore";
import { AppUpdateProvider } from "./AppUpdateContext";
import { createAppUpdatePreferencesService } from "../../lib/bilibili/appUpdatePreferences";
import { M3FeedbackProvider } from "./m3";

const { savePreferences } = vi.hoisted(() => ({
  savePreferences: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../lib/bilibili/services", () => ({
  createPlaybackPreferencesService: () => ({
    load: vi.fn().mockResolvedValue({
      defaultQualityWifi: 80,
      defaultQualityCellular: 32,
      enableDoubleTapSeek: true,
    }),
    save: savePreferences,
  }),
}));

function updateSwitch() {
  const tile = screen.getByText("启动时检查更新").closest(".m3-list-tile") as HTMLElement;
  return tile.querySelector("[role=switch]") as HTMLElement;
}

describe("PersonalizationSettingsView startup update toggle", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reads and writes through the shared app update preferences service", async () => {
    render(<AppUpdateProvider><M3FeedbackProvider><PersonalizationSettingsView /></M3FeedbackProvider></AppUpdateProvider>);

    await screen.findByText("启动时检查更新");
    let toggle = updateSwitch();
    expect(toggle).toHaveAttribute("aria-checked", "true");

    fireEvent.click(toggle);
    toggle = updateSwitch();
    expect(toggle).toHaveAttribute("aria-checked", "false");

    const preferences = createAppUpdatePreferencesService();
    expect(preferences.loadStartupCheckEnabled()).toBe(false);
  });

  it("triggers an immediate check when re-enabled", async () => {
    localStorage.setItem("rixia_focubili_startup_update_check_v1", "false");
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      tag_name: "v1.2.3",
      html_url: "https://example.com/release",
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AppUpdateProvider><M3FeedbackProvider><PersonalizationSettingsView /></M3FeedbackProvider></AppUpdateProvider>);
    await screen.findByText("启动时检查更新");
    let toggle = updateSwitch();
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(toggle);
    toggle = updateSwitch();
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("exposes the appearance and backup page from personalization settings", async () => {
    render(<AppUpdateProvider><M3FeedbackProvider><PersonalizationSettingsView /></M3FeedbackProvider></AppUpdateProvider>);
    expect(await screen.findByText("外观、密度与备份")).toBeInTheDocument();
  });

  it("opens the appearance and backup page from a real button", async () => {
    render(<AppUpdateProvider><M3FeedbackProvider><PersonalizationSettingsView /></M3FeedbackProvider></AppUpdateProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "外观、密度与备份" }));
    expect(useAppStore.getState().view).toBe("preferences");
  });

  it("reverts a playback preference and reports failure when saving fails", async () => {
    savePreferences.mockResolvedValueOnce(false);
    render(<AppUpdateProvider><M3FeedbackProvider><PersonalizationSettingsView /></M3FeedbackProvider></AppUpdateProvider>);
    await screen.findByText("启用双击快进快退");

    const tile = screen.getByText("启用双击快进快退").closest(".m3-list-tile") as HTMLElement;
    const toggle = tile.querySelector("[role=switch]") as HTMLElement;
    expect(toggle).toHaveAttribute("aria-checked", "true");

    fireEvent.click(toggle);

    await waitFor(() => expect(screen.getByText("设置保存失败，请稍后重试。")).toBeInTheDocument());
    const reverted = screen.getByText("启用双击快进快退").closest(".m3-list-tile") as HTMLElement;
    expect(reverted.querySelector("[role=switch]")).toHaveAttribute("aria-checked", "true");
  });

  it("reverts the startup update toggle when the preference cannot be saved", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<AppUpdateProvider><M3FeedbackProvider><PersonalizationSettingsView /></M3FeedbackProvider></AppUpdateProvider>);
    await screen.findByText("启动时检查更新");

    let toggle = updateSwitch();
    expect(toggle).toHaveAttribute("aria-checked", "true");

    fireEvent.click(toggle);

    await waitFor(() => expect(screen.getByText("设置保存失败，请稍后重试。")).toBeInTheDocument());
    toggle = updateSwitch();
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });
});
