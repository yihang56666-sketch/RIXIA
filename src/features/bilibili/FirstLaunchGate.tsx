import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileText, Shield } from "lucide-react";
import { createFirstLaunchService } from "../../lib/bilibili/firstLaunchService";

const AGREEMENT_SECTIONS = [
  ["一、非官方项目声明", "BEID 是由个人开发者制作的第三方哔哩哔哩客户端，仅用于个人学习、技术研究和专注观看公开视频。\n\n本应用不是哔哩哔哩官方客户端，与哔哩哔哩及其关联主体不存在隶属、授权、代理、合作或其他官方关系。\n\n“哔哩哔哩”“bilibili”、相关名称、标识、视频内容及其他权利，归其各自权利人所有。"],
  ["二、服务来源与稳定性", "本应用通过哔哩哔哩公开页面、网络服务读取和播放用户有权访问的内容。由于相关接口、访问规则及平台策略可能随时发生变化，搜索、登录、播放、字幕、弹幕、收藏夹、关注列表等功能可能出现失效、受限、延迟或无法使用的情况。\n\n本应用不会绕过会员、付费课程、充电专属、私密视频、地区限制或其他访问控制。您只能访问自己依法且依照平台规则有权访问的内容。"],
  ["三、账号登录与安全", "本应用的账号登录通过哔哩哔哩官方网页完成。如您主动导入 Cookie，请注意 Cookie 可能具有登录凭证效力。请勿向他人泄露 Cookie，也不要使用来源不明、共享或不属于您本人的 Cookie。\n\n使用第三方客户端可能存在账号会话失效、接口风控或部分功能受限等风险。您应自行判断是否登录，并妥善保护自己的账号安全。"],
  ["四、隐私与本地数据", "本应用目前没有开发者自建服务器，不会将您的哔哩哔哩密码、搜索记录、播放记录、播放进度或时间点笔记上传至开发者服务器。搜索记录、观看记录、播放进度、时间点笔记及笔记截图等数据主要保存在您的设备本地。\n\n为获取视频、账号资料、字幕、弹幕及其他内容，本应用需要与哔哩哔哩及相关内容分发服务器进行网络通信，具体处理规则由相应服务提供方的协议和隐私政策决定。"],
  ["五、内容与版权", "本应用不拥有、存储或重新授权哔哩哔哩平台上的视频、音频、字幕、弹幕、封面及其他内容。您应尊重内容创作者和其他权利人的合法权益，不得利用本应用实施盗版传播、非法下载、破解访问控制、批量抓取、商业搬运、侵犯隐私或其他违反法律法规及平台规则的行为。"],
  ["六、合理使用", "您承诺仅将本应用用于合法、正当的个人用途，并遵守适用的法律法规、哔哩哔哩用户协议、社区规则和内容版权要求。请勿利用本应用干扰平台正常运行、攻击网络服务、绕过技术限制、冒用他人账号或从事其他可能损害平台、创作者、开发者及第三方权益的行为。"],
  ["七、风险说明", "本应用按当前实际状态提供。因网络故障、设备兼容性、系统限制、平台接口调整、账号状态变化或其他非开发者能够合理控制的原因，可能出现播放失败、数据异常、功能中断或本地数据丢失。在法律允许的范围内，开发者不对上述不可控原因造成的间接损失作出超出法律规定范围的保证或承担责任。"],
  ["八、协议确认", "点击“同意并继续”，表示您已经阅读、理解并同意本协议，并确认知晓本应用是未经哔哩哔哩官方授权的第三方项目及其可能存在的使用风险。如您不同意本协议的任何内容，请关闭页面并停止使用本应用。"],
] as const;

/**
 * 首次启动门 — 复刻 FocuBili 的 first_launch_gate.dart + user_agreement_page.dart。
 * 用户首次打开应用时显示用户协议与隐私政策，同意后进入主应用。
 */
export function FirstLaunchGate({ children }: { children: React.ReactNode }) {
  const service = useMemo(() => createFirstLaunchService(), []);
  const [agreed, setAgreed] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(10);

  useEffect(() => {
    setAgreed(!service.isFirstLaunch());
  }, [service]);

  useEffect(() => {
    if (agreed || secondsRemaining <= 0) return;
    const timer = window.setInterval(() => {
      setSecondsRemaining((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [agreed, secondsRemaining]);

  if (!agreed) {
    return (
      <UserAgreementPage
        secondsRemaining={secondsRemaining}
        onAgree={() => {
          if (secondsRemaining > 0) return;
          service.markAgreed();
          setAgreed(true);
        }}
      />
    );
  }
  return <>{children}</>;
}

function UserAgreementPage({ secondsRemaining, onAgree }: { secondsRemaining: number; onAgree: () => void }) {
  return (
    <div className="first-launch">
      <div className="first-launch-card">
        <div className="first-launch-icon">
          <Shield size={48} color="var(--accent)" strokeWidth={1.5} />
        </div>
        <h1>欢迎使用 BEID</h1>
        <p className="muted first-launch-sub">
          一个强调主动搜索与专注观看的 B 站学习客户端。
        </p>

        <p className="muted first-launch-date">更新日期：2026 年 7 月 18 日 · 生效日期：2026 年 7 月 18 日</p>
        {AGREEMENT_SECTIONS.map(([title, body], index) => (
          <section className="first-launch-section" key={title}>
            <h2>{index === 0 ? <FileText size={16} /> : <Shield size={16} />} {title}</h2>
            {body.split("\n\n").map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </section>
        ))}

        <button className="primary first-launch-agree" onClick={onAgree} disabled={secondsRemaining > 0}>
          <CheckCircle2 size={16} /> {secondsRemaining > 0 ? `同意并继续（${secondsRemaining} 秒）` : "同意并继续"}
        </button>
      </div>
    </div>
  );
}
