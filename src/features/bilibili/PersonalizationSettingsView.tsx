/**
 * 个性化设置页 — 1:1 React 移植自 FocuBili 的
 * personalization_settings_page.dart（743 行）。
 *
 * 结构：播放与专注（Wi-Fi/移动默认清晰度、双击快进快退）+ 应用与存储
 * （深色模式、权限管理、启动检查更新、缓存管理、关于）。
 * 宽屏（>=900 且横向）左右双栏，手机单栏。
 */

import { useEffect, useMemo, useState } from "react";
import { createPlaybackPreferencesService } from "../../lib/bilibili/services";
import { createAppUpdatePreferencesService } from "../../lib/bilibili/appUpdatePreferences";
import type { PlaybackPreferences } from "../../lib/bilibili/types";
import { useAppStore } from "../../store/useAppStore";
import type { ThemeName, ViewKey } from "../../types";
import { Mi, useM3Feedback } from "./m3";
import { useAppUpdateController } from "./AppUpdateContext";

const QUALITY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 16, label: "标清 360P" },
  { value: 32, label: "高清 480P" },
  { value: 64, label: "高清 720P" },
  { value: 80, label: "超清 1080P" },
  { value: 116, label: "1080P 高帧率" },
  { value: 120, label: "4K" },
];

type ThemeMode = "light" | "dark" | "system";

const THEME_MODE_TO_SKIN: Record<ThemeMode, ThemeName> = {
  light: "porcelain",
  dark: "graphite",
  system: "system",
};

const DARK_SKINS = ["graphite", "rosewood", "ocean", "ember", "ink", "mono"];

function skinToThemeMode(skin: string): ThemeMode {
  if (skin === "system") return "system";
  return DARK_SKINS.includes(skin) ? "dark" : "light";
}

export function PersonalizationSettingsView() {
  const preferencesService = useMemo(() => createPlaybackPreferencesService(), []);
  const showMessage = useM3Feedback().showMessage;
  const setView = useAppStore((state) => state.setView);
  const setTheme = useAppStore((state) => state.setTheme);
  const currentTheme = useAppStore((state) => state.theme);

  const [preferences, setPreferences] = useState<PlaybackPreferences | null>(null);
  const [saving, setSaving] = useState(false);
  const updatePreferences = useMemo(() => createAppUpdatePreferencesService(), []);
  const { checkNow } = useAppUpdateController();
  const [updateCheckEnabled, setUpdateCheckEnabled] = useState(() => updatePreferences.loadStartupCheckEnabled());
  const [savingUpdate, setSavingUpdate] = useState(false);
  const [workspace, setWorkspace] = useState(window.innerWidth >= 900 && window.innerWidth > window.innerHeight);

  useEffect(() => {
    const onResize = () => setWorkspace(window.innerWidth >= 900 && window.innerWidth > window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    void preferencesService.load().then(setPreferences);
  }, [preferencesService]);

  async function persist(next: PlaybackPreferences) {
    const previous = preferences;
    setPreferences(next);
    const saved = await preferencesService.save(next);
    if (!saved) {
      setPreferences(previous);
      showMessage("设置保存失败，请稍后重试。");
    }
  }

  const themeMode = skinToThemeMode(currentTheme);

  function Entry({ icon, title, subtitle, view, badge }: { icon: string; title: string; subtitle: string; view: ViewKey; badge?: boolean }) {
    return (
      <button type="button" className="m3-list-tile" style={{ minHeight: 72, width: "100%", textAlign: "left" }} aria-label={title} onClick={() => setView(view)}>
        <span className="m3-tile-leading"><Mi name={icon} /></span>
        <span className="m3-tile-body">
          <span className="m3-body-lg">{title}</span>
          <span className="m3-body-sm" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{subtitle}</span>
        </span>
        <span className="m3-tile-trailing">
          {badge && <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--m3-error)" }} />}
          <Mi name="chevron_right" />
        </span>
      </button>
    );
  }

  function PlaybackSection() {
    if (!preferences) return null;
    return (
      <section className="m3-card">
        <div className="m3-list-tile" style={{ minHeight: 64 }}>
          <span className="m3-tile-leading"><Mi name="play_circle" /></span>
          <span className="m3-tile-body"><span className="m3-title-md" style={{ fontWeight: 700 }}>播放与专注</span></span>
        </div>
        <hr className="m3-divider" style={{ margin: 0 }} />
        <QualityTile
          forWifi
          value={preferences.wifiDefaultQuality}
          onChange={(value) => {
            setSaving(true);
            void persist({ ...preferences, wifiDefaultQuality: value }).finally(() => setSaving(false));
          }}
        />
        <hr className="m3-divider" style={{ margin: 0 }} />
        <QualityTile
          value={preferences.mobileDefaultQuality}
          onChange={(value) => {
            setSaving(true);
            void persist({ ...preferences, mobileDefaultQuality: value }).finally(() => setSaving(false));
          }}
        />
        <hr className="m3-divider" style={{ margin: 0 }} />
        <div className="m3-list-tile" style={{ minHeight: 72 }}>
          <span className="m3-tile-leading"><Mi name="touch_app" /></span>
          <span className="m3-tile-body">
            <span className="m3-body-lg">启用双击快进快退</span>
            <span className="m3-body-sm">关闭后，双击视频画面的任何位置都会切换播放或暂停。</span>
          </span>
          <span className="m3-tile-trailing">
            <SwitchCheck
              checked={preferences.enableDoubleTapSeek}
              disabled={saving}
              onChange={(v) => {
                setSaving(true);
                void persist({ ...preferences, enableDoubleTapSeek: v }).finally(() => setSaving(false));
              }}
            />
          </span>
        </div>
      </section>
    );
  }

  function QualityTile({ forWifi, value, onChange }: { forWifi?: boolean; value: number; onChange: (v: number) => void }) {
    const [open, setOpen] = useState(false);
    return (
      <div className="m3-list-tile" style={{ minHeight: 72 }}>
        <span className="m3-tile-leading"><Mi name={forWifi ? "wifi" : "signal_cellular_alt"} /></span>
        <span className="m3-tile-body">
          <span className="m3-body-lg">{forWifi ? "Wi-Fi 默认清晰度" : "移动网络默认清晰度"}</span>
          <span className="m3-body-sm">当前视频没有该档位时，自动选择下一档更低清晰度</span>
        </span>
        <span className="m3-menu-anchor" style={{ position: "relative" }}>
          <button className="m3-text-btn" onClick={() => setOpen((o) => !o)} disabled={saving}>
            {QUALITY_OPTIONS.find((q) => q.value === value)?.label ?? "720P"}
          </button>
          {open && (
            <div className="m3-menu">
              {QUALITY_OPTIONS.map((q) => (
                <button
                  key={q.value}
                  className="m3-menu-item"
                  onClick={() => {
                    setOpen(false);
                    onChange(q.value);
                  }}
                >
                  <Mi name={q.value === value ? "check_circle" : "circle"} fill={q.value === value} size={18} />
                  {q.label}
                </button>
              ))}
            </div>
          )}
        </span>
      </div>
    );
  }

  function ApplicationSection() {
    return (
      <section className="m3-card">
        <div className="m3-list-tile" style={{ minHeight: 64 }}>
          <span className="m3-tile-leading"><Mi name="tune" /></span>
          <span className="m3-tile-body"><span className="m3-title-md" style={{ fontWeight: 700 }}>应用与存储</span></span>
        </div>
        <hr className="m3-divider" style={{ margin: 0 }} />
        <div style={{ padding: "12px 16px 16px" }}>
          <div className="m3-list-tile" style={{ minHeight: 56, cursor: "default", padding: 0 }}>
            <span className="m3-tile-leading"><Mi name="brightness_6" /></span>
            <span className="m3-tile-body">
              <span className="m3-body-lg">深色模式</span>
              <span className="m3-body-sm">默认跟随系统，切换后立即应用并在重启后保留</span>
            </span>
          </div>
          <div className="m3-segmented" style={{ width: "100%", marginTop: 12 }}>
            {(
              [
                ["light", "浅色", "light_mode"],
                ["dark", "深色", "dark_mode"],
                ["system", "跟随系统", "brightness_auto"],
              ] as Array<[ThemeMode, string, string]>
            ).map(([value, label, icon]) => (
              <button
                key={value}
                className={themeMode === value ? "m3-segmented-item selected" : "m3-segmented-item"}
                style={{ flex: 1, justifyContent: "center" }}
                onClick={() => setTheme(THEME_MODE_TO_SKIN[value])}
              >
                <Mi name={icon} size={18} /> {label}
              </button>
            ))}
          </div>
        </div>
        <hr className="m3-divider" style={{ margin: 0 }} />
        <Entry icon="palette" title="外观、密度与备份" subtitle="11 款皮肤、界面密度、背景图和本地数据备份" view="preferences" />
        <hr className="m3-divider" style={{ margin: 0 }} />
        <Entry icon="admin_panel_settings" title="权限管理" subtitle="统一申请、检查、取消权限，并设置后台提醒保护" view="android-permissions" />
        <hr className="m3-divider" style={{ margin: 0 }} />
        <Entry icon="desktop_windows" title="Windows 系统能力" subtitle="查看 Toast、未来提醒、MSIX 包身份与勿扰设置" view="windows-system-capabilities" />
        <hr className="m3-divider" style={{ margin: 0 }} />
        <div className="m3-list-tile" style={{ minHeight: 72 }}>
          <span className="m3-tile-leading"><Mi name="system_update_alt" /></span>
          <span className="m3-tile-body">
            <span className="m3-body-lg">启动时检查更新</span>
            <span className="m3-body-sm">每次启动从 GitHub Release 检查新的正式版本。</span>
          </span>
          <span className="m3-tile-trailing">
            <SwitchCheck
              checked={updateCheckEnabled}
              disabled={savingUpdate}
              onChange={(v) => {
                void (async () => {
                  setSavingUpdate(true);
                  const saved = updatePreferences.saveStartupCheckEnabled(v);
                  if (!saved) {
                    showMessage("设置保存失败，请稍后重试。");
                  } else {
                    setUpdateCheckEnabled(v);
                    if (v) void checkNow();
                  }
                  setSavingUpdate(false);
                })();
              }}
            />
          </span>
        </div>
        <hr className="m3-divider" style={{ margin: 0 }} />
        <Entry icon="storage" title="视频缓存管理" subtitle="查看和清理边播边缓存的数据" view="cache-management" />
        <hr className="m3-divider" style={{ margin: 0 }} />
        <Entry icon="info" title="关于" subtitle="项目地址、负责人、版本与更新" view="about" />
      </section>
    );
  }

  const playback = <PlaybackSection />;
  const application = <ApplicationSection />;

  return (
    <div className="fb fb-page">
      <header className="fb-appbar">
        <button className="m3-icon-btn" onClick={() => setView("settings")} aria-label="返回我的" title="返回我的">
          <Mi name="arrow_back" />
        </button>
        <h1 className="m3-title-lg" style={{ flex: 1, paddingLeft: 8 }}>个性化设置</h1>
      </header>
      {preferences == null ? (
        <div style={{ display: "grid", placeItems: "center", padding: 60 }}>
          <span className="m3-circular-progress lg" />
        </div>
      ) : (
        <div className="fb-scroll-page" style={{ maxWidth: 900, margin: "0 auto", width: "100%" }}>
          <div style={{ display: "flex", gap: 16, padding: 16, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 380px", minWidth: 0 }}>{playback}</div>
            {workspace ? <div style={{ flex: "1 1 380px", minWidth: 0 }}>{application}</div> : <div style={{ flex: "1 1 380px", minWidth: 0 }}>{application}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function SwitchCheck({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={checked ? "已开启" : "已关闭"}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 52,
        height: 32,
        borderRadius: 16,
        border: "none",
        background: checked ? "var(--m3-primary)" : "var(--m3-surface-container-highest)",
        position: "relative",
        cursor: disabled ? "default" : "pointer",
        padding: 0,
        flex: "0 0 auto",
        transition: "background 160ms ease",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 4,
          left: checked ? 24 : 4,
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
          transition: "left 160ms ease",
        }}
      />
    </button>
  );
}
