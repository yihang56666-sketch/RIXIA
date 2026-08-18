import { useState } from "react";
import { ChevronRight, ExternalLink, RefreshCw, Trash2 } from "lucide-react";

const APP_VERSION = "0.3.0";
const LATEST_VERSION_URL = "https://api.github.com/repos/Yihang56666-sketch/clock/releases/latest";

interface UpdateCheckResult {
  latestVersion?: string;
  hasUpdate: boolean;
  releaseUrl?: string;
  error?: string;
}

export function useAppUpdateCheck(): {
  check: () => Promise<UpdateCheckResult>;
  result: UpdateCheckResult | null;
  loading: boolean;
} {
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  return {
    async check() {
      setLoading(true);
      try {
        const response = await fetch(LATEST_VERSION_URL, { headers: { Accept: "application/json" } });
        if (!response.ok) {
          setResult({ hasUpdate: false, error: `HTTP ${response.status}` });
          return result ?? { hasUpdate: false };
        }
        const data = await response.json() as { tag_name?: string; html_url?: string };
        const latest = data.tag_name?.replace(/^v/, "") ?? "";
        const hasUpdate = latest && latest !== APP_VERSION;
        const next = { latestVersion: latest, hasUpdate: Boolean(hasUpdate), releaseUrl: data.html_url };
        setResult(next);
        return next;
      } catch (err) {
        const next = { hasUpdate: false, error: err instanceof Error ? err.message : "未知错误" };
        setResult(next);
        return next;
      } finally {
        setLoading(false);
      }
    },
    result,
    loading,
  };
}

export function AppUpdatePage() {
  const { check, result, loading } = useAppUpdateCheck();
  return (
    <div className="stack">
      <section className="card">
        <h2>应用更新</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>当前版本：{APP_VERSION}</p>
        <button className="primary compact" onClick={() => check()} disabled={loading} style={{ marginTop: 10 }}>
          {loading ? <RefreshCw size={14} className="spin" /> : <RefreshCw size={14} />}
          检查更新
        </button>
        {result && (
          <div style={{ marginTop: 12 }}>
            {result.hasUpdate ? (
              <p>
                发现新版本：{result.latestVersion}{" "}
                <a href={result.releaseUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={13} /> 前往下载
                </a>
              </p>
            ) : (
              <p className="muted" style={{ fontSize: 13 }}>
                {result.error ? `检查失败：${result.error}` : "已是最新版本"}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

export function CacheManagementPage() {
  const [stats, setStats] = useState<{ count: number; bytes: number } | null>(null);
  const [cleared, setCleared] = useState(false);

  function refresh() {
    setCleared(false);
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
      let bytes = 0;
      let count = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          bytes += (localStorage.getItem(key)?.length ?? 0) * 2;
          count += 1;
        }
      }
      setStats({ count, bytes });
      return;
    }
    navigator.storage.estimate().then((est) => {
      setStats({ count: 0, bytes: est.usage ?? 0 });
    });
  }

  function clearAll() {
    if (!window.confirm("将清空 localStorage 中所有 RIXIA 数据（任务/习惯/笔记/专注/日记/B站设置等）。确定继续吗？")) return;
    localStorage.clear();
    setCleared(true);
    refresh();
  }

  return (
    <div className="stack">
      <section className="card">
        <h2>缓存管理</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          RIXIA 把所有数据存放在浏览器 localStorage。清空后无法恢复，请提前导出备份。
        </p>
        <button className="ghost-btn compact" onClick={refresh}>刷新统计</button>
        {stats && (
          <div style={{ marginTop: 10, fontSize: 13 }}>
            <p>键数量：{stats.count || "（由浏览器 Storage API 估算）"}</p>
            <p>占用：{formatBytes(stats.bytes)}</p>
          </div>
        )}
        <button className="ghost-btn compact" onClick={clearAll} style={{ marginTop: 10, color: "var(--danger)" }}>
          <Trash2 size={14} /> 清空所有本地数据
        </button>
        {cleared && <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>已清空。请刷新页面以重置应用。</p>}
      </section>
    </div>
  );
}

export function ProblemDiagnosticsPage() {
  const [report, setReport] = useState<string>("");

  function diagnose() {
    const lines: string[] = [];
    lines.push(`RIXIA ${APP_VERSION}`);
    lines.push(`Time: ${new Date().toISOString()}`);
    lines.push(`Online: ${typeof navigator !== "undefined" ? navigator.onLine : "unknown"}`);
    lines.push(`UserAgent: ${typeof navigator !== "undefined" ? navigator.userAgent : "unknown"}`);
    lines.push(`Storage estimate: ${typeof navigator !== "undefined" && typeof navigator.storage?.estimate === "function" ? "supported" : "unsupported"}`);
    lines.push(`localStorage keys: ${typeof localStorage !== "undefined" ? localStorage.length : 0}`);
    lines.push(`Service worker: ${typeof navigator !== "undefined" && "serviceWorker" in navigator ? "supported" : "unsupported"}`);
    const authRaw = typeof localStorage !== "undefined" ? localStorage.getItem("rixia_bilibili_auth_v1") : null;
    lines.push(`Bilibili auth: ${authRaw ? "signed-in" : "signed-out"}`);
    setReport(lines.join("\n"));
  }

  return (
    <div className="stack">
      <section className="card">
        <h2>问题诊断</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          生成系统诊断报告（不含 Cookie 或个人数据），复制后可贴给开发者。
        </p>
        <button className="primary compact" onClick={diagnose} style={{ marginTop: 10 }}>
          生成报告
        </button>
        {report && (
          <textarea
            className="field"
            readOnly
            value={report}
            style={{ marginTop: 10, minHeight: 200, fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}
          />
        )}
      </section>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export { ChevronRight };
