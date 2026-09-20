import { useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { APP_VERSION, AppUpdateStatus } from "../../lib/bilibili/miscServices";
import { useAppUpdateController } from "./AppUpdateContext";
import { Mi } from "./m3";
import { restartTourPlayback } from "../tour/FeatureTour";

const RELEASES_URL = "https://github.com/Yihang56666-sketch/RIXIA/releases";

function updateStatusText(result: ReturnType<typeof useAppUpdateController>["result"]): string {
  switch (result.status) {
    case AppUpdateStatus.idle: return "尚未检查更新";
    case AppUpdateStatus.disabled: return "已关闭启动时检查更新";
    case AppUpdateStatus.checking: return "正在检查更新…";
    case AppUpdateStatus.upToDate: return "当前已是最新版本";
    case AppUpdateStatus.available: return `发现新版本 ${result.latestVersion}`;
    case AppUpdateStatus.failed: return result.message ?? "暂时无法检查更新";
    default: return "尚未检查更新";
  }
}

export function AboutView() {
  const setView = useAppStore((state) => state.setView);
  const { result, checking, hasUpdate, checkNow } = useAppUpdateController();

  useEffect(() => {
    if (result.status === AppUpdateStatus.idle) void checkNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fb fb-page">
      <header className="fb-appbar">
        <button className="m3-icon-btn" onClick={() => setView("settings")} aria-label="返回我的" title="返回我的">
          <Mi name="arrow_back" />
        </button>
        <h1 className="m3-title-lg" style={{ flex: 1, paddingLeft: 8 }}>关于</h1>
      </header>
      <div className="fb-scroll-page">
        <div style={{ maxWidth: 760, margin: "0 auto", padding: 20, display: "grid", gap: 16 }}>
          <section className="m3-card focubili-about-hero" style={{ padding: 28, textAlign: "center" }}>
            <img src="/beid-icon.png?v=3" alt="" className="focubili-about-icon" style={{ width: 64, height: 64, borderRadius: 16 }} />
            <h2 className="m3-title-lg" style={{ fontWeight: 700, marginTop: 14 }}>BEID</h2>
            <p className="m3-body-sm fb-on-surface-variant">版本 {APP_VERSION}</p>
            <p className="m3-body-md" style={{ marginTop: 10 }}>个人节奏工作台与 B 站专注学习客户端。</p>
          </section>

          <button
            className="m3-card"
            style={{ padding: 20, display: "flex", alignItems: "center", gap: 12, textAlign: "left", border: "none", cursor: "pointer", width: "100%" }}
            onClick={() => restartTourPlayback()}
          >
            <Mi name="help_center" size={22} />
            <span style={{ flex: 1 }}>
              <span className="m3-body-lg" style={{ display: "block", fontWeight: 700 }}>功能教学</span>
              <span className="m3-body-sm fb-on-surface-variant">重播新手巡览，认识首页、搜索、资料库、弹幕、专注与命令面板</span>
            </span>
            <Mi name="chevron_right" />
          </button>

          <button
            className="m3-card"
            style={{ padding: 20, display: "flex", alignItems: "center", gap: 12, textAlign: "left", border: "none", cursor: "pointer", width: "100%" }}
            onClick={() => setView("problem-diagnostics")}
          >
            <Mi name="bug_report" size={22} />
            <span style={{ flex: 1 }}>
              <span className="m3-body-lg" style={{ display: "block", fontWeight: 700 }}>问题诊断</span>
              <span className="m3-body-sm fb-on-surface-variant">脱敏环境信息与最近错误记录，不会自动上传</span>
            </span>
            <Mi name="chevron_right" />
          </button>

          <section className="m3-card" style={{ padding: 20, background: hasUpdate ? "var(--m3-error-container)" : undefined }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Mi name={hasUpdate ? "system_update_alt" : "update"} size={20} />
              <h2 className="m3-title-md" style={{ fontWeight: 700, flex: 1 }}>检查更新</h2>
              {hasUpdate && <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--m3-error)" }} />}
            </div>
            <p className="m3-body-md" style={{ marginTop: 10 }}>{updateStatusText(result)}</p>
            {hasUpdate && result.releaseHighlights.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <p className="m3-body-sm" style={{ fontWeight: 700 }}>本次更新</p>
                <ul style={{ marginTop: 6, paddingLeft: 18, display: "grid", gap: 4 }}>
                  {result.releaseHighlights.map((highlight, index) => (
                    <li key={index} className="m3-body-sm">{highlight}</li>
                  ))}
                </ul>
              </div>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 14, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button className="m3-outlined-btn" onClick={() => void checkNow()} disabled={checking}>
                {checking ? <span className="m3-circular-progress" style={{ width: 16, height: 16 }} /> : <Mi name="refresh" size={16} />}
                重新检查
              </button>
              {hasUpdate && (
                <a
                  className="m3-filled-btn"
                  href={result.downloadUrl ?? result.releaseUrl ?? RELEASES_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Mi name={result.downloadUrl ? "download" : "open_in_new"} size={16} />
                  {result.downloadUrl ? "下载安装包" : "查看 Release"}
                </a>
              )}
            </div>
          </section>

          <section className="m3-card" style={{ padding: 20 }}>
            <h2 className="m3-title-md" style={{ fontWeight: 700 }}>
              <ShieldCheck size={17} /> 使用边界
            </h2>
            <ul className="m3-body-md about-list" style={{ marginTop: 10, paddingLeft: 20, display: "grid", gap: 6, lineHeight: 1.6 }}>
              <li>本应用是未经哔哩哔哩官方授权的第三方客户端。</li>
              <li>账号 Cookie、播放进度、笔记和全部个人数据默认保存在当前设备。</li>
              <li>请遵守哔哩哔哩用户协议、社区规则及内容版权要求。</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
