import {
  Archive,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Database,
  FilePenLine,
  Heart,
  History,
  ListChecks,
  LogIn,
  RefreshCw,
  Smartphone,
  Settings,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { createBilibiliAuthService, type BilibiliAuthState } from "../../lib/bilibili/accountService";
import { useAppStore } from "../../store/useAppStore";
import type { ViewKey } from "../../types";

type ProfileAction = { label: string; hint: string; view: ViewKey; icon: typeof Heart };

const ACCOUNT_ACTIONS: ProfileAction[] = [
  { label: "我的收藏", hint: "查看 B 站收藏夹", view: "favorites", icon: Heart },
  { label: "我的关注", hint: "查看关注的 UP 主", view: "followed", icon: UserRoundCheck },
  { label: "订阅合集", hint: "查看订阅的视频合集", view: "subscribed-collections", icon: Archive },
  { label: "观看历史", hint: "继续上次观看的视频", view: "watch-history", icon: History },
];

const LOCAL_ACTIONS: ProfileAction[] = [
  { label: "学习清单", hint: "管理未完成的视频分 P", view: "learning-list", icon: ListChecks },
  { label: "时间点笔记", hint: "回看视频中的记录", view: "video-notes", icon: FilePenLine },
  { label: "专注统计", hint: "查看专注趋势和记录", view: "focus-statistics", icon: Clock3 },
];

const SYSTEM_ACTIONS: ProfileAction[] = [
  { label: "缓存管理", hint: "管理本地播放缓存", view: "cache-management", icon: Database },
  { label: "问题诊断", hint: "查看运行状态与诊断信息", view: "problem-diagnostics", icon: ShieldCheck },
  { label: "设置", hint: "播放、主题和应用设置", view: "preferences", icon: Settings },
  { label: "应用更新", hint: "检查 FocuBili 新版本", view: "app-update", icon: RefreshCw },
  { label: "Android 权限", hint: "通知、精确提醒与勿扰设置", view: "android-permissions", icon: Smartphone },
];

function ProfileRow({ action }: { action: ProfileAction }) {
  const setView = useAppStore((state) => state.setView);
  const Icon = action.icon;
  return (
    <button className="focubili-profile-row" onClick={() => setView(action.view)}>
      <span className="focubili-profile-icon"><Icon size={20} strokeWidth={1.9} /></span>
      <span className="focubili-profile-copy"><strong>{action.label}</strong><small>{action.hint}</small></span>
      <ChevronRight size={19} color="var(--focubili-muted)" />
    </button>
  );
}

export function ProfileHub() {
  const auth = useMemo(() => createBilibiliAuthService(), []);
  const setView = useAppStore((state) => state.setView);
  const [account] = useState<BilibiliAuthState>(auth.currentState());

  return (
    <div className="focubili-profile stack">
      <section className="focubili-profile-account">
        <span className="focubili-avatar"><CircleUserRound size={44} strokeWidth={1.45} /></span>
        <div>
          <h1>{account.signedIn ? account.userName || "已登录用户" : "未登录"}</h1>
          <p>{account.signedIn ? "账号数据仅在当前设备使用" : "登录后可查看收藏、关注和观看历史"}</p>
        </div>
        <button className="primary compact" onClick={() => setView("login")}>
          <LogIn size={15} /> {account.signedIn ? "账号管理" : "登录"}
        </button>
      </section>

      <section className="focubili-profile-group">
        <h2>账号数据</h2>
        {ACCOUNT_ACTIONS.map((action) => <ProfileRow key={action.view} action={action} />)}
      </section>
      <section className="focubili-profile-group">
        <h2>本地学习</h2>
        {LOCAL_ACTIONS.map((action) => <ProfileRow key={action.view} action={action} />)}
      </section>
      <section className="focubili-profile-group">
        <h2>应用与存储</h2>
        {SYSTEM_ACTIONS.map((action) => <ProfileRow key={action.view} action={action} />)}
      </section>
      <p className="focubili-profile-foot"><Archive size={14} /> FocuBili · 数据仅保存于本机</p>
    </div>
  );
}
