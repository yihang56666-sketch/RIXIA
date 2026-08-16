import { Download, ImagePlus, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import { THEMES, TOOLS } from "../../catalog";
import { Switch } from "../../components/Switch";
import { compressBackgroundImage } from "../../lib/backgroundImage";
import { useAppStore } from "../../store/useAppStore";

export function SettingsView() {
  const {
    theme,
    setTheme,
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
  } = useAppStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const [backgroundError, setBackgroundError] = useState("");

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
    const state = useAppStore.getState();
    const payload = {
      exportedAt: new Date().toISOString(),
      app: "RIXIA",
      version: "0.2.0",
      data: {
        tasks: state.tasks,
        habits: state.habits,
        notes: state.notes,
        countdowns: state.countdowns,
        inbox: state.inbox,
        subjects: state.subjects,
        studyUnits: state.studyUnits,
        focusSessions: state.focusSessions,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `rixia-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
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
          <div className="data-stat"><strong>{countdowns.length}</strong><span>倒计时</span></div>
          <div className="data-stat"><strong>{inbox.length}</strong><span>想法</span></div>
          <div className="data-stat"><strong>{subjects.length}</strong><span>科目</span></div>
          <div className="data-stat"><strong>{focusSessions.length}</strong><span>专注回合</span></div>
        </div>
        <button className="ghost-btn" style={{ marginTop: 14 }} onClick={exportData}>
          <Download size={16} /> 导出数据备份（JSON）
        </button>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
          所有内容仅保存在当前设备的本地存储中，不会上传到任何服务器。
        </p>
      </section>

      <section className="card" style={{ textAlign: "center" }}>
        <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
          RIXIA · v0.2.0<br />一个安静、本地优先的个人节奏工作台
        </p>
      </section>
    </div>
  );
}
