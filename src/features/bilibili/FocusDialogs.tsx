/**
 * 专注弹窗集 — 1:1 React 移植自 FocuBili 的：
 * - focus_completion_dialog.dart（175 行，含 120 片礼花 Canvas 动画）
 * - focus_interruption_dialog.dart（477 行，鼓励→原因两步流程）
 * - custom_focus_duration_dialog.dart（91 行）
 * - focus_do_not_disturb.dart（82 行，Web 无系统勿扰，仅保留说明）
 */

import { useEffect, useRef, useState } from "react";
import type { FullFocusSession } from "../../lib/bilibili/focusSessionModel";
import { FocusInterruptionKind } from "../../lib/bilibili/focusSessionModel";
import { createFocusEncouragementService } from "../../lib/bilibili/miscServices";
import { M3Dialog, Mi, useM3Feedback } from "./m3";
import { useFocusTimer } from "./useFocusTimer";
import { FocusSharePreview } from "./FocusSharePreview";
import { buildFocusSessionShareText } from "../../lib/bilibili/focusShareService";
import { FocusReminderBackgroundGuide } from "./FocusOnboardingGuides";

// ============ Completion Dialog ============

const CONFETTI_COLORS = ["#ff5252", "#ffc107", "#40c4ff", "#69f0ae", "#e040fb"];

function ConfettiCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const duration = 3000;

    function draw(now: number) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const progress = Math.min(1, (now - start) / duration);
      const dpr = window.devicePixelRatio || 1;
      const width = window.innerWidth;
      const height = window.innerHeight;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const particleCount = 120;
      for (let index = 0; index < particleCount; index += 1) {
        const delay = (index % 5) * 0.025;
        if (progress < delay) continue;
        const phase = Math.min(1, Math.max(0, (progress - delay) / (1 - delay)));
        if (phase >= 1) continue;
        const baseX = ((index * 47) % particleCount) / particleCount;
        const sway = Math.sin(phase * Math.PI * 3 + index) * 18;
        const x = baseX * width + sway;
        const fallProgress = phase * phase * phase;
        const y = -30 + fallProgress * (height + 70);
        const w = 4 + (index % 3) * 2;
        const h = 8 + (index % 4) * 2;
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = CONFETTI_COLORS[index % CONFETTI_COLORS.length]!;
        ctx.translate(x, y);
        ctx.rotate(phase * Math.PI * 5 + index * 0.4);
        ctx.beginPath();
        ctx.roundRect(-w / 2, -h / 2, w, h, 2);
        ctx.fill();
        ctx.restore();
      }
      if (progress < 1) {
        raf = requestAnimationFrame(draw);
      }
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: "fixed", inset: 0, zIndex: 1250, pointerEvents: "none" }}
    />
  );
}

export function FocusCompletionDialog({
  session,
  onClose,
  onExtend,
}: {
  session: FullFocusSession;
  onClose: () => void;
  onExtend: (extensionMs: number) => Promise<boolean>;
}) {
  const [showSharePreview, setShowSharePreview] = useState(false);
  const [extending, setExtending] = useState(false);
  const shareSummary = buildFocusSessionShareText({
    goal: session.goal,
    focusedMs: session.accumulatedFocusMs,
    interruptions: session.interruptions.length,
  });

  async function handleExtend() {
    if (extending) return;
    setExtending(true);
    const extended = await onExtend(5 * 60_000);
    setExtending(false);
    if (extended) onClose();
  }

  return (
    <>
      <ConfettiCanvas />
      <M3Dialog
        title="专注已结束，做得好！"
        centerContent
        centerActions
        onClose={undefined}
        actions={
          <>
            <button className="m3-text-btn" onClick={() => setShowSharePreview(true)} aria-label="分享专注成果">
              <Mi name="ios_share" size={18} /> 分享
            </button>
            <button className="m3-text-btn" onClick={onClose}>
              完成
            </button>
            <button className="m3-filled-btn" onClick={() => void handleExtend()} disabled={extending}>
              <Mi name="more_time" size={18} /> 再专注 5 分钟
            </button>
          </>
        }
      >
        <span style={{ display: "block", fontSize: 38, lineHeight: 1, marginBottom: 12 }}>🎉</span>
        {"你完成了“"}
        {session.goal}
        {"”"}
        <br />
        本次专注 {Math.round(session.plannedDurationMs / 60_000)} 分钟。
      </M3Dialog>
      {showSharePreview && (
        <FocusSharePreview
          title="专注成果"
          summary={shareSummary}
          fileName={`focubili_focus_${session.id}`}
          onClose={() => setShowSharePreview(false)}
        >
          <h3>专注完成</h3>
          <p>{session.goal}</p>
          <div className="focus-share-metrics">
            <span>专注 <strong>{Math.round(session.accumulatedFocusMs / 60_000)} 分钟</strong></span>
            <span>计划 <strong>{Math.round(session.plannedDurationMs / 60_000)} 分钟</strong></span>
            <span>打断 <strong>{session.interruptions.length} 次</strong></span>
          </div>
        </FocusSharePreview>
      )}
    </>
  );
}

// ============ Interruption Flow (鼓励 → 原因) ============

interface InterruptionDraft {
  reason: string;
  reminderAt?: string;
}

function formatReminder(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function InterruptionReasonDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: (draft: InterruptionDraft) => void;
  onCancel: () => void;
}) {
  const showMessage = useM3Feedback().showMessage;
  const [reason, setReason] = useState("");
  const [reminderAt, setReminderAt] = useState<string | null>(null);

  function confirm() {
    const trimmed = reason.trim();
    onConfirm({ reason: trimmed.length === 0 ? "未填写原因" : trimmed, reminderAt: reminderAt ?? undefined });
  }

  return (
    <M3Dialog
      title="记录这次打断"
      onClose={onCancel}
      actions={
        <>
          <button className="m3-text-btn" onClick={onCancel}>返回</button>
          <button className="m3-tonal-btn" onClick={confirm}>确认</button>
        </>
      }
    >
      <label className="m3-field" style={{ alignItems: "flex-start" }}>
        <textarea
          className="fb-textarea"
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 80))}
          maxLength={80}
          rows={3}
          placeholder="退出或暂停原因（可选）"
        />
      </label>
      <p className="m3-field-hint" style={{ marginTop: -8, marginBottom: 8 }}>
        不填写将记录为“未填写原因”
      </p>
      <label className="m3-outlined-btn" style={{ cursor: "pointer", width: "100%" }}>
        <Mi name="notifications_active" size={18} />
        <input
          key={reminderAt ?? "empty"}
          type="datetime-local"
          defaultValue=""
          onChange={(e) => {
            const value = e.target.value;
            if (!value) return;
            const selected = new Date(value);
            if (selected.getTime() <= Date.now()) {
              showMessage("提醒时间需要晚于现在");
              return;
            }
            setReminderAt(selected.toISOString());
          }}
          style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
        />
        {reminderAt === null ? "设置下次继续时间（可选）" : formatReminder(reminderAt)}
      </label>
      {reminderAt !== null && (
        <button className="m3-text-btn" style={{ marginTop: 4, alignSelf: "flex-start" }} onClick={() => setReminderAt(null)}>
          不设置提醒
        </button>
      )}
    </M3Dialog>
  );
}

/** 鼓励 → 原因两步打断流程；返回是否确认打断。 */
export function FocusInterruptionFlow({
  kind,
  onDone,
}: {
  kind: FocusInterruptionKind;
  onDone: (interrupted: boolean) => void;
}) {
  const timer = useFocusTimer();
  const [step, setStep] = useState<"encouragement" | "reason">("encouragement");
  const [message, setMessage] = useState("");
  const [backgroundGuideVisible, setBackgroundGuideVisible] = useState(false);

  useEffect(() => {
    const session = timer.activeSession;
    if (!session) {
      onDone(true);
      return;
    }
    const nearCompletion = timer.progress >= 0.8 || timer.remainingMs <= 5 * 60_000;
    void createFocusEncouragementService()
      .messageFor(nearCompletion, Math.floor(Date.now() / 1000))
      .then(setMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (step === "reason") {
    return (
      <>
      <InterruptionReasonDialog
        onCancel={() => onDone(false)}
        onConfirm={async (draft) => {
          await timer.interruptFocus({
            kind,
            reason: draft.reason,
            reminderAt: draft.reminderAt,
          });
          if (draft.reminderAt) {
            setBackgroundGuideVisible(true);
          } else {
            onDone(true);
          }
        }}
      />
      {backgroundGuideVisible && (
        <FocusReminderBackgroundGuide onDismiss={() => { setBackgroundGuideVisible(false); onDone(true); }} />
      )}
      </>
    );
  }

  if (!timer.activeSession) {
    return null;
  }

  const nearCompletion = timer.progress >= 0.8 || timer.remainingMs <= 5 * 60_000;
  return (
    <M3Dialog
      icon={<Mi name={nearCompletion ? "emoji_events" : "favorite"} />}
      title={nearCompletion ? "马上就完成了" : "要不要再坚持一下？"}
      onClose={() => onDone(false)}
      actions={
        <>
          <button className="m3-text-btn" onClick={() => setStep("reason")}>
            {kind === FocusInterruptionKind.playerExit ? "仍然退出" : "仍要暂停"}
          </button>
          <button className="m3-filled-btn" onClick={() => onDone(false)}>
            继续专注
          </button>
        </>
      }
    >
      {message}
    </M3Dialog>
  );
}

// ============ Termination Dialog ============

export function FocusTerminationDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <M3Dialog
      title="终止本次专注？"
      onClose={onCancel}
      actions={
        <>
          <button className="m3-text-btn" onClick={onCancel}>继续专注</button>
          <button
            className="m3-tonal-btn"
            onClick={() => {
              const trimmed = reason.trim();
              onConfirm(trimmed.length === 0 ? "未填写原因" : trimmed);
            }}
          >
            确认终止
          </button>
        </>
      }
    >
      <label className="m3-field" style={{ alignItems: "flex-start" }}>
        <textarea
          className="fb-textarea"
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 80))}
          maxLength={80}
          rows={3}
          placeholder="终止原因（可选）"
        />
      </label>
      <p className="m3-field-hint" style={{ marginTop: -8 }}>
        只有确认终止才会计入“提前结束”
      </p>
    </M3Dialog>
  );
}

// ============ Custom Duration Dialog ============

export function CustomFocusDurationDialog({
  initialMinutes,
  onConfirm,
  onCancel,
}: {
  initialMinutes: number;
  onConfirm: (minutes: number) => void;
  onCancel: () => void;
}) {
  const [minutes, setMinutes] = useState(String(initialMinutes));
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    const parsed = Number(minutes.trim());
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 180) {
      setError("请输入 1 到 180 的整数");
      return;
    }
    onConfirm(parsed);
  }

  return (
    <M3Dialog
      title="自定义专注时间"
      onClose={onCancel}
      actions={
        <>
          <button className="m3-text-btn" onClick={onCancel}>取消</button>
          <button className="m3-filled-btn" onClick={confirm}>确定</button>
        </>
      }
    >
      <div className="m3-field m3-field-floating" style={{ marginBottom: error ? 0 : 20 }}>
        <input
          type="number"
          value={minutes}
          autoFocus
          onChange={(e) => {
            setMinutes(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirm();
          }}
          placeholder=" "
        />
        <label>分钟</label>
      </div>
      {error ? (
        <p className="m3-field-error">{error}</p>
      ) : (
        <p className="m3-field-hint">可填写 1 到 180 分钟</p>
      )}
    </M3Dialog>
  );
}
