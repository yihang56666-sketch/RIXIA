import { Download, ImagePlus, RotateCcw, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { DENSITIES, THEMES, TOOLS } from "../../catalog";
import { Switch } from "../../components/Switch";
import { compressBackgroundImage } from "../../lib/backgroundImage";
import { useAppStore } from "../../store/useAppStore";
import type { Density } from "../../types";

export function SettingsView() {
  const {
    theme,
    setTheme,
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
      app: "RIXIA",
      formatVersion: 3,
      data: payload,
    };
    const blob = new Blob([JSON.stringify(wrapper, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `rixia-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importData(file: File | undefined) {
    if (!file) return;
    setImportMessage("");
    try {
      const parsed = JSON.parse(await file.text());
      if (!window.confirm("导入会覆盖当前的全部数据，确定继续吗？建议先导出一份当前数据。")) return;
      useAppStore.getState().importBackup(parsed);
      setImportMessage("导入完成，数据已恢复");
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "导入失败");
    }
  }

  return (
    <div className="stack">
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
        <h2>首页模块</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 3 }}>选择要显示在首页的工具</p>
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
          <button className="ghost-btn" onClick={exportData}>
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
        <h2>关于与许可证</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>RIXIA · v0.3.0 · 持久化格式 v3</p>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.6 }}>
          一个安静、本地优先的个人节奏工作台。所有数据仅保存在本机，不依赖云服务、账号或分析追踪。
        </p>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.6 }}>
          本应用借鉴了下列开源项目的数据模型与 UX 思路（不直接包含其代码，仅作为设计参考）：
        </p>
        <ul className="about-list">
          <li>Loop Habit Tracker（GPL-3.0）— 习惯频率类型与连续记录</li>
          <li>Super Productivity（MIT）— 专注回合循环与每周回顾</li>
          <li>usememos/memos（MIT）+ AFFiNE（MIT 前端）— 日记页与 markdown + #tag + [[wiki-link]]</li>
        </ul>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.6 }}>
          若通过 FocuBili 等 Flutter 应用作为宿主嵌入使用，合体版属于 FocuBili 派生作品，受 GPL-3.0-only 约束。Web/PWA 单独使用时不携带 GPL 义务。
        </p>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.6 }}>
          RIXIA 主体源代码尚未声明开源许可证；在添加许可证前，仓库持有者保留全部权利。
        </p>
      </section>
    </div>
  );
}
