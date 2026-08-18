import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileText, Shield } from "lucide-react";
import { createFirstLaunchService } from "../../lib/bilibili/firstLaunchService";
import { useAppStore } from "../../store/useAppStore";

/**
 * 首次启动门 — 复刻 FocuBili 的 first_launch_gate.dart + user_agreement_page.dart。
 * 用户首次打开应用时显示用户协议与隐私政策，同意后进入主应用。
 */
export function FirstLaunchGate({ children }: { children: React.ReactNode }) {
  const service = useMemo(() => createFirstLaunchService(), []);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    setAgreed(!service.isFirstLaunch());
  }, [service]);

  if (!agreed) {
    return <UserAgreementPage onAgree={() => { service.markAgreed(); setAgreed(true); }} />;
  }
  return <>{children}</>;
}

function UserAgreementPage({ onAgree }: { onAgree: () => void }) {
  const setView = useAppStore((state) => state.setView);
  return (
    <div className="first-launch">
      <div className="first-launch-card">
        <div className="first-launch-icon">
          <Shield size={48} color="var(--accent)" strokeWidth={1.5} />
        </div>
        <h1>欢迎使用 RIXIA</h1>
        <p className="muted first-launch-sub">
          一个本地优先的个人节奏工作台，集成 B 站学习播放能力。
        </p>

        <section className="first-launch-section">
          <h2><FileText size={16} /> 用户协议</h2>
          <ul>
            <li>RIXIA 是本地优先应用，所有数据保存在本机，不会上传到任何服务器。</li>
            <li>B 站账号 Cookie 仅保存在浏览器 localStorage，仅用于请求 B 站官方 API。</li>
            <li>视频播放使用 B 站官方嵌入播放器，弹幕通过公开 XML 接口加载。</li>
            <li>本应用不收集任何用户行为数据，不嵌入分析或广告追踪。</li>
            <li>使用本应用即视为已知悉并接受以上条款。</li>
          </ul>
        </section>

        <section className="first-launch-section">
          <h2><Shield size={16} /> 隐私政策</h2>
          <ul>
            <li>任务、习惯、笔记、专注、日记等数据均存于本地 localStorage。</li>
            <li>登录态 Cookie 不会以任何方式上传或同步到第三方。</li>
            <li>清空浏览器/WebView 数据会清除所有本地内容，请提前导出备份。</li>
            <li>不主动访问相机、麦克风、定位等敏感权限。</li>
          </ul>
        </section>

        <button className="primary first-launch-agree" onClick={onAgree}>
          <CheckCircle2 size={16} /> 同意并开始使用
        </button>
        <button className="ghost-btn compact" onClick={() => setView("today")}>
          稍后再看
        </button>
      </div>
    </div>
  );
}
