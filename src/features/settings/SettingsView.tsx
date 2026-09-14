import { Download, ImagePlus, RotateCcw, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DENSITIES, THEMES, TOOLS } from "../../catalog";
import { Switch } from "../../components/Switch";
import { compressBackgroundImage } from "../../lib/backgroundImage";
import { useAppStore } from "../../store/useAppStore";
import type { Density } from "../../types";
import { createDanmakuPreferencesService, createPlaybackPreferencesService } from "../../lib/bilibili/services";
import type { DanmakuPreferences, PlaybackPreferences } from "../../lib/bilibili/types";
import { DEFAULT_DANMAKU_PREFERENCES, DEFAULT_PLAYBACK_PREFERENCES } from "../../lib/bilibili/types";
import { qualityLabel } from "../../lib/bilibili/qualityPolicy";
import { createFocusPreferencesService } from "../../lib/bilibili/focusServices";
import { createAppUpdatePreferencesService } from "../../lib/bilibili/appUpdatePreferences";
import { APP_VERSION } from "../../lib/bilibili/miscServices";
import { M3Dialog, Mi } from "../bilibili/m3";
import { todayKey } from "../../lib/time";

export function SettingsView() {
  const {
    theme,
    setTheme,
    setView,
    density,
    setDensity,
    enabledTools,
    toggleTool,
    backgroundImage,
    setBackgroundImage,
    tasks,
    habits,
    notes,
    countdowns,
    subjects,
    inbox,
    focusSessions,
    resources,
    timestampNotes,
    journals,
  } = useAppStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const [backgroundError, setBackgroundError] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [pendingImport, setPendingImport] = useState<{ data: unknown } | null>(null);
  const playbackPreferencesService = useMemo(() => createPlaybackPreferencesService(), []);
  const danmakuPreferencesService = useMemo(() => createDanmakuPreferencesService(), []);
  const focusPreferencesService = useMemo(() => createFocusPreferencesService(), []);
  const appUpdatePreferencesService = useMemo(() => createAppUpdatePreferencesService(), []);
  const [playbackPreferences, setPlaybackPreferences] = useState<PlaybackPreferences>(DEFAULT_PLAYBACK_PREFERENCES);
  const [danmakuPreferences, setDanmakuPreferences] = useState<DanmakuPreferences>(DEFAULT_DANMAKU_PREFERENCES);
  // 最新偏好快照：事件处理器里计算 next 用（避免 updater 内做副作用）。
  const playbackPreferencesRef = useRef(playbackPreferences);
  playbackPreferencesRef.current = playbackPreferences;
  const danmakuPreferencesRef = useRef(danmakuPreferences);
  danmakuPreferencesRef.current = danmakuPreferences;
  // 屏蔽词输入的原始草稿：避免受控值过滤空段导致逗号打不进去
  const [blockedKeywordsDraft, setBlockedKeywordsDraft] = useState<string | null>(null);
  const [focusDoNotDisturb, setFocusDoNotDisturb] = useState(false);
  const [startupUpdateCheck, setStartupUpdateCheck] = useState(() => appUpdatePreferencesService.loadStartupCheckEnabled());

  useEffect(() => {
    let cancelled = false;
    void playbackPreferencesService.load().then((value) => {
      if (!cancelled) setPlaybackPreferences(value);
    });
    return () => { cancelled = true; };
  }, [playbackPreferencesService]);

  useEffect(() => {
    let cancelled = false;
    void danmakuPreferencesService.load().then((value) => {
      if (!cancelled) setDanmakuPreferences(value);
    });
    return () => { cancelled = true; };
  }, [danmakuPreferencesService]);

  useEffect(() => {
    let cancelled = false;
    void focusPreferencesService.load().then((value) => {
      if (!cancelled) setFocusDoNotDisturb(value.enableDoNotDisturb);
    });
    return () => { cancelled = true; };
  }, [focusPreferencesService]);

  // 副作用（写存储）必须留在事件处理器里：放进 setState updater 会在
  // StrictMode 双调用/并发重放下被重复执行。
  function updatePlaybackPreferences(patch: Partial<PlaybackPreferences>) {
    const next = { ...playbackPreferencesRef.current, ...patch };
    setPlaybackPreferences(next);
    void playbackPreferencesService.save(next);
  }

  function updateDanmakuPreferences(patch: Partial<DanmakuPreferences>) {
    const next = { ...danmakuPreferencesRef.current, ...patch };
    setDanmakuPreferences(next);
    void danmakuPreferencesService.save(next);
  }

  function updateFocusDoNotDisturb(enabled: boolean) {
    setFocusDoNotDisturb(enabled);
    void focusPreferencesService.saveDoNotDisturbEnabled(enabled);
  }

  async function updateStartupUpdateCheck(enabled: boolean) {
    const previous = startupUpdateCheck;
    setStartupUpdateCheck(enabled);
    const saved = appUpdatePreferencesService.saveStartupCheckEnabled(enabled);
    if (!saved) setStartupUpdateCheck(previous);
  }

  async function selectBackground(file: File | undefined) {
    if (!file) return;
    setBackgroundError("");
    try {
      setBackgroundImage(await compressBackgroundImage(file));
    } catch (error) {
      setBackgroundError(error instanceof Error ? error.message : "背景设置失败");
    }
  }

  function exportData() {
    const payload = useAppStore.getState().exportBackup();
    const wrapper = {
      exportedAt: new Date().toISOString(),
      app: "BEID",
      formatVersion: 3,
      data: payload,
    };
    const blob = new Blob([JSON.stringify(wrapper, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    // 文件名用本地日期：toISOString 的 UTC 日期在 UTC+8 每天零点到八点会变成“昨天”。
    anchor.download = `beid-backup-${todayKey()}.json`;
    anchor.click();
    // 下载导航异步消费 blob URL：同步 revoke 在 Firefox/Safari 上可能中断下载。
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function importData(file: File | undefined) {
    if (!file) return;
    setImportMessage("");
    try {
      const parsed = JSON.parse(await file.text());
      setPendingImport({ data: parsed });
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "导入失败");
    }
  }

  function confirmImport() {
    if (!pendingImport) return;
    try {
      // importBackup 返回被过滤掉的条目数：不报告丢弃数等于宣称"全部恢复"。
      const { droppedTotal } = useAppStore.getState().importBackup(pendingImport.data);
      setImportMessage(
        droppedTotal > 0
          ? `导入完成，数据已恢复；另有 ${droppedTotal} 条格式异常的记录被跳过`
          : "导入完成，数据已恢复",
      );
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "导入失败");
    } finally {
      setPendingImport(null);
    }
  }

  return (
    <div className="fb fb-page">
      <header className="fb-appbar">
        <button className="m3-icon-btn" onClick={() => setView("personalization")} aria-label="返回个性化设置" title="返回个性化设置">
          <Mi name="arrow_back" />
        </button>
        <h1 className="m3-title-lg" style={{ flex: 1, paddingLeft: 8 }}>外观、密度与备份</h1>
      </header>
      <div className="fb-scroll-page">
    <div className="stack" style={{ maxWidth: 760, margin: "0 auto", padding: 16 }}>
      <section className="card">
        <h2>主题外观</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 3 }}>选择一款皮肤，随时可以更换</p>
        <div className="theme-grid">
          {THEMES.map((item) => (
            <button
              key={item.key}
              className={theme === item.key ? "theme-card active" : "theme-card"}
              onClick={() => setTheme(item.key)}
              aria-label={`使用主题 ${item.name}`}
              aria-pressed={theme === item.key}
            >
              <span
                className="theme-preview"
                style={{ backgroundColor: item.swatch[0] }}
              >
                <span style={{
                  position: "absolute", right: 4, top: 4, width: 9, height: 9,
                  borderRadius: 3, backgroundColor: item.swatch[1],
                  boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)",
                }} />
                <span style={{
                  position: "absolute", left: 5, bottom: 5, width: 12, height: 5,
                  borderRadius: 999, backgroundColor: item.swatch[2],
                }} />
              </span>
              <span className="theme-name">{item.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>视频播放</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 3 }}>设置 B 站视频的默认播放行为</p>
        <div style={{ marginTop: 8 }}>
          <div className="item">
            <Switch
              checked={playbackPreferences.resumeFromLastPosition}
              onChange={(checked) => updatePlaybackPreferences({ resumeFromLastPosition: checked })}
              label="记住上次播放位置"
            />
            <div><p>记住上次播放位置</p><p className="muted" style={{ fontSize: 12.5 }}>打开视频时从上次停下的位置继续</p></div>
            <span />
          </div>
          <div className="item">
            <Switch
              checked={playbackPreferences.enableDoubleTapSeek}
              onChange={(checked) => updatePlaybackPreferences({ enableDoubleTapSeek: checked })}
              label="双击快进快退"
            />
            <div><p>双击快进快退</p><p className="muted" style={{ fontSize: 12.5 }}>关闭后双击只切换播放与暂停</p></div>
            <span />
          </div>
          <label className="settings-field">
            Wi-Fi 默认清晰度
            <select aria-label="Wi-Fi 默认清晰度" value={playbackPreferences.wifiDefaultQuality} onChange={(event) => updatePlaybackPreferences({ wifiDefaultQuality: Number(event.target.value) })}>
              {[16, 32, 64, 80, 116, 120].map((quality) => <option key={quality} value={quality}>{quality} · {qualityLabel(quality)}</option>)}
            </select>
          </label>
          <label className="settings-field">
            移动网络默认清晰度
            <select aria-label="移动网络默认清晰度" value={playbackPreferences.mobileDefaultQuality} onChange={(event) => updatePlaybackPreferences({ mobileDefaultQuality: Number(event.target.value) })}>
              {[16, 32, 64, 80, 116, 120].map((quality) => <option key={quality} value={quality}>{quality} · {qualityLabel(quality)}</option>)}
            </select>
          </label>
          <label className="settings-field">
            默认倍速
            <select aria-label="默认倍速" value={playbackPreferences.playbackRate} onChange={(event) => updatePlaybackPreferences({ playbackRate: Number(event.target.value) })}>
              {[0.5, 0.75, 1, 1.25, 1.5, 2, 3].map((rate) => <option key={rate} value={rate}>{rate}x</option>)}
            </select>
          </label>
          <label className="settings-field">
            默认音量
            <input aria-label="默认音量" type="range" min="0" max="1" step="0.1" value={playbackPreferences.defaultVolume} onChange={(event) => updatePlaybackPreferences({ defaultVolume: Number(event.target.value) })} />
            <span className="muted" style={{ fontSize: 12 }}>{Math.round(playbackPreferences.defaultVolume * 100)}%</span>
          </label>
        </div>
      </section>

      <section className="card">
        <h2>弹幕显示</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 3 }}>应用到所有 B 站视频播放页面</p>
        <div style={{ marginTop: 8 }}>
          <div className="item">
            <Switch
              checked={danmakuPreferences.enabled}
              onChange={(enabled) => updateDanmakuPreferences({ enabled })}
              label="启用弹幕"
            />
            <div><p>启用弹幕</p><p className="muted" style={{ fontSize: 12.5 }}>关闭后不加载和渲染弹幕</p></div>
            <span />
          </div>
          <label className="settings-field">
            弹幕不透明度
            <input aria-label="弹幕不透明度" type="range" min="0" max="1" step="0.1" value={danmakuPreferences.opacity} onChange={(event) => updateDanmakuPreferences({ opacity: Number(event.target.value) })} />
            <span className="muted" style={{ fontSize: 12 }}>{Math.round(danmakuPreferences.opacity * 100)}%</span>
          </label>
          <label className="settings-field">
            弹幕字号
            <input aria-label="弹幕字号" type="range" min="8" max="48" step="1" value={danmakuPreferences.fontSize} onChange={(event) => updateDanmakuPreferences({ fontSize: Number(event.target.value) })} />
            <span className="muted" style={{ fontSize: 12 }}>{danmakuPreferences.fontSize}px</span>
          </label>
          <label className="settings-field">
            显示区域
            <input aria-label="弹幕显示区域" type="range" min="0.1" max="1" step="0.1" value={danmakuPreferences.displayArea} onChange={(event) => updateDanmakuPreferences({ displayArea: Number(event.target.value) })} />
            <span className="muted" style={{ fontSize: 12 }}>{Math.round(danmakuPreferences.displayArea * 100)}%</span>
          </label>
          <label className="settings-field">
            弹幕轨道数
            <input aria-label="弹幕轨道数" type="range" min="1" max="30" step="1" value={danmakuPreferences.laneCount} onChange={(event) => updateDanmakuPreferences({ laneCount: Number(event.target.value) })} />
            <span className="muted" style={{ fontSize: 12 }}>{danmakuPreferences.laneCount}</span>
          </label>
          <label className="settings-field">
            滚动时长
            <input aria-label="弹幕滚动时长" type="range" min="3" max="30" step="1" value={danmakuPreferences.scrollDurationSeconds} onChange={(event) => updateDanmakuPreferences({ scrollDurationSeconds: Number(event.target.value) })} />
            <span className="muted" style={{ fontSize: 12 }}>{danmakuPreferences.scrollDurationSeconds} 秒</span>
          </label>
          <label className="settings-field">
            描边宽度
            <input aria-label="弹幕描边宽度" type="range" min="0" max="6" step="1" value={danmakuPreferences.strokeWidth} onChange={(event) => updateDanmakuPreferences({ strokeWidth: Number(event.target.value) })} />
            <span className="muted" style={{ fontSize: 12 }}>{danmakuPreferences.strokeWidth}px</span>
          </label>
          <div className="item">
            <Switch checked={danmakuPreferences.showScrolling} onChange={(showScrolling) => updateDanmakuPreferences({ showScrolling })} label="滚动弹幕" />
            <div><p>滚动弹幕</p></div><span />
          </div>
          <div className="item">
            <Switch checked={danmakuPreferences.showTop} onChange={(showTop) => updateDanmakuPreferences({ showTop })} label="顶部弹幕" />
            <div><p>顶部弹幕</p></div><span />
          </div>
          <div className="item">
            <Switch checked={danmakuPreferences.showBottom} onChange={(showBottom) => updateDanmakuPreferences({ showBottom })} label="底部弹幕" />
            <div><p>底部弹幕</p></div><span />
          </div>
          <div className="item">
            <Switch checked={danmakuPreferences.mergeRepeated} onChange={(mergeRepeated) => updateDanmakuPreferences({ mergeRepeated })} label="合并重复弹幕" />
            <div><p>合并重复弹幕</p><p className="muted" style={{ fontSize: 12.5 }}>减少同一时段的重复内容</p></div><span />
          </div>
          <label className="settings-field">
            弹幕屏蔽词
            <input
              aria-label="弹幕屏蔽词"
              type="text"
              value={blockedKeywordsDraft ?? danmakuPreferences.blockedKeywords.join(", ")}
              onChange={(event) => {
                const raw = event.target.value;
                setBlockedKeywordsDraft(raw);
                updateDanmakuPreferences({ blockedKeywords: raw.split(",").map((keyword) => keyword.trim()).filter(Boolean) });
              }}
              onBlur={() => setBlockedKeywordsDraft(null)}
            />
            <span className="muted" style={{ fontSize: 12 }}>逗号分隔</span>
          </label>
        </div>
      </section>

      <section className="card">
        <h2>专注辅助</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 3 }}>专注视频播放时减少系统通知干扰</p>
        <div className="item" style={{ marginTop: 8 }}>
          <Switch checked={focusDoNotDisturb} onChange={updateFocusDoNotDisturb} label="专注时启用勿扰" />
          <div><p>专注时启用勿扰</p><p className="muted" style={{ fontSize: 12.5 }}>Android 需要在系统设置中授予勿扰权限</p></div>
          <span />
        </div>
      </section>

      <section className="card">
        <h2>应用更新</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 3 }}>从本项目的 GitHub Release 查询正式版本</p>
        <div className="item" style={{ marginTop: 8 }}>
          <Switch checked={startupUpdateCheck} onChange={updateStartupUpdateCheck} label="启动时检查更新" />
          <div><p>启动时检查更新</p><p className="muted" style={{ fontSize: 12.5 }}>每次打开应用时检查新的正式版本</p></div>
          <span />
        </div>
      </section>

      <section className="card">
        <h2>密度</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 3 }}>调整间距与控件大小，影响整个应用</p>
        <div className="segmented" style={{ marginTop: 10 }} role="tablist" aria-label="界面密度">
          {DENSITIES.map((item) => (
            <button
              key={item.key}
              role="tab"
              aria-selected={density === item.key}
              className={density === item.key ? "segmented-item active" : "segmented-item"}
              onClick={() => setDensity(item.key as Density)}
              title={item.hint}
            >
              {item.name}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>个性背景</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 3 }}>选择相册图片作为全屏背景，图片会压缩后保存在本机。</p>
        <input
          ref={fileInput}
          className="visually-hidden"
          type="file"
          accept="image/*"
          onChange={(event) => void selectBackground(event.target.files?.[0])}
        />
        <div className="row background-actions">
          <button className="ghost-btn" onClick={() => fileInput.current?.click()}>
            <ImagePlus size={17} /> {backgroundImage ? "更换背景" : "选择图片"}
          </button>
          {backgroundImage && (
            <button className="ghost-btn" onClick={() => setBackgroundImage(null)}>
              <RotateCcw size={17} /> 恢复默认
            </button>
          )}
        </div>
        {backgroundImage && <div className="background-preview" style={{ backgroundImage: `url(${backgroundImage})` }} />}
        {backgroundError && <p className="background-error">{backgroundError}</p>}
      </section>

      <section className="card">
        <h2>工具页模块</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 3 }}>选择要显示在工具页的模块</p>
        <div style={{ marginTop: 6 }}>
          {TOOLS.map((tool) => {
            const on = enabledTools.includes(tool.key);
            return (
              <div className="item" key={tool.key}>
                <Switch checked={on} onChange={() => toggleTool(tool.key)} label={`${tool.title}模块`} />
                <div>
                  <p>{tool.title}</p>
                  <p className="muted" style={{ fontSize: 12.5 }}>{tool.reason}</p>
                </div>
                <span />
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h2>数据</h2>
        <div className="data-stats">
          <div className="data-stat"><strong>{tasks.length}</strong><span>任务</span></div>
          <div className="data-stat"><strong>{habits.length}</strong><span>习惯</span></div>
          <div className="data-stat"><strong>{notes.length}</strong><span>笔记</span></div>
          <div className="data-stat"><strong>{journals.length}</strong><span>日记</span></div>
          <div className="data-stat"><strong>{countdowns.length}</strong><span>倒计时</span></div>
          <div className="data-stat"><strong>{inbox.length}</strong><span>想法</span></div>
          <div className="data-stat"><strong>{subjects.length}</strong><span>科目</span></div>
          <div className="data-stat"><strong>{focusSessions.length}</strong><span>专注回合</span></div>
          <div className="data-stat"><strong>{resources.length}</strong><span>课程</span></div>
          <div className="data-stat"><strong>{timestampNotes.length}</strong><span>时间点笔记</span></div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <button className="ghost-btn" onClick={exportData} data-tour-target="backup-export">
            <Download size={16} /> 导出数据备份（JSON）
          </button>
          <input
            ref={importInput}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void importData(event.target.files?.[0])}
          />
          <button className="ghost-btn" onClick={() => importInput.current?.click()}>
            <Upload size={16} /> 从备份导入
          </button>
        </div>
        {importMessage && <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>{importMessage}</p>}
        <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
          所有内容仅保存在当前设备的本地存储中，不会上传到任何服务器。
        </p>
      </section>

      <section className="card">
        <h2>关于</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>BEID · {APP_VERSION} · 持久化格式 v3</p>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.6 }}>
          一个安静、本地优先的个人节奏工作台。所有数据仅保存在本机，不依赖云服务、账号或分析追踪。
        </p>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.6 }}>
          当前 BEID 是一个独立的 React/TypeScript/Capacitor 应用，B 站搜索、账号、播放器、专注和笔记能力均已直接融入本项目，不依赖任何外部宿主或消息桥。
        </p>
      </section>

      {pendingImport && (
        <M3Dialog
          title="导入数据备份？"
          onClose={() => setPendingImport(null)}
          actions={
            <>
              <button className="m3-text-btn" onClick={() => setPendingImport(null)}>取消</button>
              <button className="m3-tonal-btn" onClick={confirmImport}>确认导入</button>
            </>
          }
        >
          <p>导入会覆盖当前设备上的全部 BEID 数据。建议先导出当前备份，再继续。</p>
        </M3Dialog>
      )}
    </div>
      </div>
    </div>
  );
}
