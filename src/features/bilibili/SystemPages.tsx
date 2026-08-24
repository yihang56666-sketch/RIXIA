import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ChevronRight, Clipboard, RefreshCw, Trash2 } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { nativeFocusNotification } from "../../lib/focusNotifications";
import { createMediaCacheService } from "../../lib/bilibili/mediaCacheService";
import { createDiagnosticsService } from "../../lib/bilibili/diagnosticsService";
import { createPlaybackPreferencesService } from "../../lib/bilibili/services";
import type { PlaybackPreferences } from "../../lib/bilibili/types";
import { APP_VERSION } from "../../lib/bilibili/miscServices";
import { M3Dialog, Mi } from "./m3";
import { RixiaWorkspacePage } from "./RixiaWorkspacePage";

export function CacheManagementPage() {
  const cacheService = createMediaCacheService();
  const [stats, setStats] = useState<{ count: number; bytes: number }>(() => cacheService.stats());
  const [cleared, setCleared] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  function refresh() {
    setCleared(false);
    setStats(cacheService.stats());
  }

  function clearAll() {
    cacheService.clear();
    setCleared(true);
    setStats(cacheService.stats());
    setConfirmClear(false);
  }

  return (
    <RixiaWorkspacePage title="视频缓存管理" backView="personalization" backLabel="返回个性化设置">
    <div className="stack">
      <section className="card">
        <h2>缓存管理</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          这里只管理 BEID 的本地播放进度缓存，不会影响 Rixia 的任务、习惯、笔记和专注记录。
        </p>
        <button className="m3-outlined-btn" onClick={refresh}>刷新统计</button>
        {stats && (
          <div style={{ marginTop: 10, fontSize: 13 }}>
            <p>缓存条目：{stats.count}</p>
            <p>占用：{formatBytes(stats.bytes)}</p>
          </div>
        )}
        <button className="m3-outlined-btn" onClick={() => setConfirmClear(true)} style={{ marginTop: 10, color: "var(--danger)" }}>
          <Trash2 size={14} /> 清除播放缓存
        </button>
        {cleared && <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>已清空。请刷新页面以重置应用。</p>}
      </section>
      {confirmClear && (
        <M3Dialog
          title="清除播放缓存？"
          onClose={() => setConfirmClear(false)}
          actions={
            <>
              <button className="m3-text-btn" onClick={() => setConfirmClear(false)}>取消</button>
              <button className="m3-tonal-btn" onClick={clearAll}>确认清除</button>
            </>
          }
        >
          <p>将清除 BEID 的本地播放进度缓存，不会删除任务、习惯、笔记、专注记录或 B 站登录状态。</p>
        </M3Dialog>
      )}
    </div>
    </RixiaWorkspacePage>
  );
}

export function ProblemDiagnosticsPage() {
  const diagnostics = useMemo(() => createDiagnosticsService(), []);
  const [report, setReport] = useState<string>("");
  const [errors, setErrors] = useState(() => diagnostics.list());
  const [message, setMessage] = useState("");
  const [playbackPrefs, setPlaybackPrefs] = useState<PlaybackPreferences | null>(null);
  const [cacheStats, setCacheStats] = useState<{ count: number; bytes: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      createPlaybackPreferencesService().load(),
      Promise.resolve(createMediaCacheService().stats()),
    ]).then(([prefs, cache]) => {
      if (cancelled) return;
      setPlaybackPrefs(prefs);
      setCacheStats(cache);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  function diagnose() {
    const lines: string[] = [];
    lines.push(`BEID ${APP_VERSION}`);
    lines.push(`Time: ${new Date().toISOString()}`);
    lines.push(`Online: ${typeof navigator !== "undefined" ? navigator.onLine : "unknown"}`);
    lines.push(`UserAgent: ${typeof navigator !== "undefined" ? navigator.userAgent : "unknown"}`);
    lines.push(`Storage estimate: ${typeof navigator !== "undefined" && typeof navigator.storage?.estimate === "function" ? "supported" : "unsupported"}`);
    lines.push(`localStorage keys: ${typeof localStorage !== "undefined" ? localStorage.length : 0}`);
    lines.push(`Service worker: ${typeof navigator !== "undefined" && "serviceWorker" in navigator ? "supported" : "unsupported"}`);
    const authRaw = typeof localStorage !== "undefined" ? localStorage.getItem("rixia_bilibili_auth_v1") : null;
    lines.push(`Bilibili auth: ${authRaw ? "signed-in" : "signed-out"}`);
    if (playbackPrefs) {
      lines.push(`Default quality: ${playbackPrefs.defaultQuality ?? 80}`);
      lines.push(`Playback rate: ${playbackPrefs.playbackRate ?? 1}`);
      lines.push(`Resume from last position: ${playbackPrefs.resumeFromLastPosition ?? true}`);
      lines.push(`Enable double-tap seek: ${playbackPrefs.enableDoubleTapSeek ?? true}`);
    }
    if (cacheStats) {
      lines.push(`Cache entries: ${cacheStats.count}`);
      lines.push(`Cache bytes: ${cacheStats.bytes}`);
    }
    setReport(lines.join("\n"));
  }

  async function copyDiagnostics() {
    const content = report || [
      `BEID ${APP_VERSION}`,
      `Time: ${new Date().toISOString()}`,
      `Online: ${typeof navigator !== "undefined" ? navigator.onLine : "unknown"}`,
      "Recent errors:",
      ...errors.map((item) => `${item.occurredAt ?? "unknown"} ${item.source ?? "app"}: ${item.message}`),
    ].join("\n");
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(content);
      setMessage("诊断信息已复制");
    } else {
      setMessage("当前环境不支持复制，请手动选择文本");
    }
  }

  function clearDiagnostics() {
    diagnostics.clear();
    setErrors([]);
    setMessage("诊断记录已清空");
  }

  return (
    <RixiaWorkspacePage title="问题诊断" backView="about" backLabel="返回关于">
    <div className="stack">
      <section className="card">
        <h2>问题诊断</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          生成系统诊断报告（不含 Cookie 或个人数据），复制后可贴给开发者。
        </p>
        <button className="m3-filled-btn" onClick={diagnose} style={{ marginTop: 10 }}>
          生成报告
        </button>
        <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
          <button className="m3-outlined-btn" onClick={() => void copyDiagnostics()}><Clipboard size={14} /> 复制诊断信息</button>
          <button className="m3-outlined-btn" onClick={clearDiagnostics} style={{ color: "var(--danger)" }}><Trash2 size={14} /> 清空诊断记录</button>
        </div>
        {message && <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }} role="status">{message}</p>}
        <div style={{ marginTop: 14 }}>
          <h3 style={{ fontSize: 14 }}>基础环境信息</h3>
          <p className="muted" style={{ fontSize: 12.5 }}>在线：{typeof navigator !== "undefined" && navigator.onLine ? "是" : "否"} · 本地存储：{typeof localStorage !== "undefined" ? localStorage.length : 0} 项</p>
        </div>
        <div style={{ marginTop: 12 }}>
          <h3 style={{ fontSize: 14 }}>最近错误</h3>
          {errors.length === 0 ? <p className="muted" style={{ fontSize: 12.5 }}>暂无诊断记录。</p> : (
            <ul className="diagnostic-error-list">
              {errors.map((item, index) => <li key={`${item.occurredAt ?? "error"}-${index}`}><strong>{item.message}</strong><small>{item.occurredAt ?? "时间未知"}{item.source ? ` · ${item.source}` : ""}</small></li>)}
            </ul>
          )}
        </div>
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
    </RixiaWorkspacePage>
  );
}

export function AndroidPermissionManagementPage() {
  const [overview, setOverview] = useState<{ notificationAllowed?: boolean; exactAlarmAllowed?: boolean; supportsExactAlarm?: boolean } | null>(null);
  const [message, setMessage] = useState("");
  const isAndroid = Capacitor.getPlatform() === "android";

  async function refresh() {
    if (!isAndroid || !nativeFocusNotification.getOverview) {
      setOverview(null);
      setMessage("当前运行环境不是 Android，系统权限由浏览器或桌面系统管理。");
      return;
    }
    setOverview(await nativeFocusNotification.getOverview());
    setMessage("");
  }

  async function requestNotification() {
    if (!nativeFocusNotification.requestPermission) return;
    await nativeFocusNotification.requestPermission();
    await refresh();
  }

  useEffect(() => { void refresh(); }, [isAndroid]);

  return (
    <RixiaWorkspacePage title="权限管理" backView="personalization" backLabel="返回个性化设置">
    <div className="stack">
      <section className="card">
        <h2>Android 权限管理</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          专注提醒只使用通知和系统闹钟；应用不会请求相机、麦克风或定位权限。
        </p>
        {message && <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>{message}</p>}
        {overview && (
          <div className="permission-status-list">
            <PermissionStatus label="通知权限" allowed={overview.notificationAllowed === true} />
            <PermissionStatus label="精确闹钟" allowed={overview.exactAlarmAllowed === true} optional={!overview.supportsExactAlarm} />
          </div>
        )}
        <div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
          <button className="m3-outlined-btn" onClick={() => void refresh()}><RefreshCw size={14} /> 刷新状态</button>
          {isAndroid && <>
            <button className="m3-outlined-btn" onClick={() => void requestNotification()}>请求通知权限</button>
            <button className="m3-outlined-btn" onClick={() => void nativeFocusNotification.openSettings?.()}>通知设置</button>
            <button className="m3-outlined-btn" onClick={() => void nativeFocusNotification.openExactAlarmSettings?.()}>精确闹钟设置</button>
            <button className="m3-outlined-btn" onClick={() => void nativeFocusNotification.openDoNotDisturbSettings?.()}>勿扰设置</button>
          </>}
        </div>
      </section>
    </div>
    </RixiaWorkspacePage>
  );
}

export function WindowsSystemCapabilitiesPage() {
  const [loading, setLoading] = useState(true);
  const [notificationAvailable, setNotificationAvailable] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("default");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh() {
    setLoading(true);
    try {
      if (typeof Notification === "undefined") {
        setNotificationPermission("unsupported");
        setNotificationAvailable(false);
      } else {
        const permission = Notification.permission;
        setNotificationPermission(permission);
        setNotificationAvailable(permission === "granted");
      }
    } finally {
      setLoading(false);
    }
  }

  async function requestNotificationPermission() {
    if (typeof Notification === "undefined" || typeof Notification.requestPermission !== "function") return;
    setLoading(true);
    try {
      await Notification.requestPermission();
    } finally {
      await refresh();
    }
  }

  async function sendTestNotification() {
    if (sending || !notificationAvailable) return;
    setSending(true);
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("Windows 通知测试", { body: "BEID 通知测试", tag: "focubili-windows-test" });
        setMessage("测试通知已提交给系统");
      }
    } finally {
      setSending(false);
    }
  }

  function openNotificationSettings() {
    void nativeFocusNotification.openSettings?.();
  }

  function openDoNotDisturbSettings() {
    void nativeFocusNotification.openDoNotDisturbSettings?.();
  }

  useEffect(() => { void refresh(); }, []);

  return (
    <RixiaWorkspacePage title="Windows 系统能力" backView="personalization" backLabel="返回个性化设置">
      <div style={{ maxWidth: 720, margin: "0 auto", width: "100%" }}>
        <div style={{ display: "grid", gap: 12, padding: 16 }}>
          <p className="m3-headline-sm" style={{ fontWeight: 700 }}>Windows 桌面能力</p>
          <p className="m3-body-md" style={{ color: "var(--m3-on-surface-variant)" }}>
            这里显示桌面端实际使用的系统能力，不需要 Android 的闹钟、勿扰或电量权限。
          </p>
          <WindowsCapabilityCard
            icon="notifications_active"
            title="Windows 通知"
            status={loading ? "正在检测" : notificationAvailable ? "可用" : "暂不可用"}
            description="专注完成时显示 Toast，也可以发送一条测试通知。"
            actions={
              <>
                <button className="m3-outlined-btn" onClick={openNotificationSettings}>系统通知设置</button>
                {notificationPermission === "default" && (
                  <button className="m3-outlined-btn" onClick={() => void requestNotificationPermission()}>请求通知权限</button>
                )}
                <button
                  className="m3-tonal-btn"
                  disabled={!notificationAvailable || sending}
                  onClick={() => void sendTestNotification()}
                >
                  {sending ? "正在发送…" : "发送测试通知"}
                </button>
              </>
            }
          />
          <WindowsCapabilityCard
            icon="schedule"
            title="未来继续提醒"
            status={notificationAvailable ? "可用" : "暂不可用"}
            description="由系统安排一次性提醒；应用关闭后仍由系统等待触发。"
          />
          <WindowsCapabilityCard
            icon="inventory_2"
            title="安装包身份"
            status="当前为普通 exe"
            description="即时和未来提醒可用；安装正式 MSIX 后才能完整查询、撤回系统通知。"
          />
          <WindowsCapabilityCard
            icon="do_not_disturb_on"
            title="Windows 系统专注"
            status="需要手动启动"
            description="自动启动需要微软单独批准的受限功能授权。当前版本不会再修改旧通知注册表来模拟成功；请从 Windows“时钟”启动系统专注。"
          />
          <WindowsCapabilityCard
            icon="settings"
            title="Windows 勿扰设置"
            status="可打开"
            description="打开微软公开支持的系统设置页，手动调整勿扰和自动规则。"
            actions={
              <button className="m3-outlined-btn" onClick={openDoNotDisturbSettings}>打开勿扰设置</button>
            }
          />
          {message && <p className="m3-body-md" style={{ marginTop: 8 }}>{message}</p>}
        </div>
      </div>
    </RixiaWorkspacePage>
  );
}

function WindowsCapabilityCard({
  icon,
  title,
  status,
  description,
  actions,
}: {
  icon: string;
  title: string;
  status: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <section className="m3-card" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Mi name={icon} />
        <span style={{ flex: 1, fontWeight: 700 }}>{title}</span>
        <span className="m3-chip">{status}</span>
      </div>
      <p className="m3-body-md" style={{ marginTop: 8, color: "var(--m3-on-surface-variant)" }}>{description}</p>
      {actions && <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>{actions}</div>}
    </section>
  );
}

function PermissionStatus({ label, allowed, optional = false }: { label: string; allowed: boolean; optional?: boolean }) {
  return <div className="permission-status-row"><span>{label}</span><strong className={allowed || optional ? "allowed" : "blocked"}>{optional ? "系统不支持" : allowed ? "已允许" : "未允许"}</strong></div>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export { ChevronRight };
