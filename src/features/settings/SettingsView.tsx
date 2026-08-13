import { ImagePlus, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import { TOOLS } from "../../catalog";
import { compressBackgroundImage } from "../../lib/backgroundImage";
import { useAppStore } from "../../store/useAppStore";

export function SettingsView() {
  const { theme, setTheme, enabledTools, toggleTool, backgroundImage, setBackgroundImage } = useAppStore();
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

  return (
    <div className="stack">
      <section className="card">
        <h2>主题</h2>
        <div className="row" style={{ marginTop: 12 }}>
          <button className={theme === "paper" ? "chip active" : "chip"} onClick={() => setTheme("paper")}>纸张</button>
          <button className={theme === "ink" ? "chip active" : "chip"} onClick={() => setTheme("ink")}>墨色</button>
        </div>
      </section>
      <section className="card">
        <h2>个性背景</h2>
        <p className="muted">选择手机相册图片作为全屏背景，图片会压缩并保存在本机。</p>
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
        <p className="muted">选择要显示在首页的工具</p>
        {TOOLS.map((tool) => {
          const on = enabledTools.includes(tool.key);
          return (
            <div className="item" key={tool.key}>
              <button className={on ? "check on" : "check"} onClick={() => toggleTool(tool.key)} />
              <div>
                <p>{tool.title}</p>
                <p className="muted">{tool.reason}</p>
              </div>
              <span />
            </div>
          );
        })}
      </section>
      <section className="card">
        <p className="muted">所有内容仅保存在当前浏览器的本地存储中。</p>
      </section>
    </div>
  );
}
