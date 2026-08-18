import { useState } from "react";
import { CheckCircle2, Plus, X } from "lucide-react";
import type { FullFocusSession } from "../../lib/bilibili/focusSessionModel";
import { FocusSessionStatus } from "../../lib/bilibili/focusSessionModel";

/**
 * RIXIA 专注对话框集 — 1:1 React 移植自 FocuBili 的：
 * - focus_completion_dialog.dart（175 行）
 * - focus_interruption_dialog.dart（477 行）
 * - custom_focus_duration_dialog.dart（91 行）
 * - focus_do_not_disturb.dart（82 行）
 */

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h${minutes}m`;
  return `${minutes}m`;
}

// ============ Completion Dialog ============

export function FocusCompletionDialog({
  session,
  onClose,
  onExtend,
}: {
  session: FullFocusSession;
  onClose: () => void;
  onExtend: (extensionMs: number) => Promise<boolean>;
}) {
  const isCompleted = session.status === FocusSessionStatus.completed;
  const [extending, setExtending] = useState(false);

  async function handleExtend(minutes: number) {
    setExtending(true);
    await onExtend(minutes * 60000);
    setExtending(false);
    onClose();
  }

  return (
    <div className="modal-overlay" role="dialog" aria-label="专注完成">
      <div className="modal-card focus-completion">
        <div className="focus-completion-icon">
          <CheckCircle2
            size={48}
            color={isCompleted ? "var(--good)" : "var(--danger)"}
            strokeWidth={1.5}
          />
        </div>
        <h2>{isCompleted ? "专注完成！" : "专注已结束"}</h2>
        <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
          {session.goal}
        </p>
        <div className="focus-completion-stats">
          <div className="focus-stat-item">
            <strong style={{ fontSize: 20 }}>{formatDuration(session.accumulatedFocusMs)}</strong>
            <span className="muted" style={{ fontSize: 12 }}>专注时长</span>
          </div>
          <div className="focus-stat-item">
            <strong style={{ fontSize: 20 }}>{formatDuration(session.plannedDurationMs)}</strong>
            <span className="muted" style={{ fontSize: 12 }}>计划时长</span>
          </div>
          {session.interruptions.length > 0 && (
            <div className="focus-stat-item">
              <strong style={{ fontSize: 20 }}>{session.interruptions.length}</strong>
              <span className="muted" style={{ fontSize: 12 }}>打断次数</span>
            </div>
          )}
          {session.terminationReason && (
            <div className="focus-stat-item">
              <strong style={{ fontSize: 14 }}>{session.terminationReason}</strong>
              <span className="muted" style={{ fontSize: 12 }}>结束原因</span>
            </div>
          )}
        </div>
        <div className="focus-completion-actions">
          {isCompleted && (
            <>
              <button
                className="ghost-btn compact"
                onClick={() => handleExtend(5)}
                disabled={extending}
              >
                <Plus size={14} /> 续 5 分钟
              </button>
              <button
                className="ghost-btn compact"
                onClick={() => handleExtend(15)}
                disabled={extending}
              >
                <Plus size={14} /> 续 15 分钟
              </button>
            </>
          )}
          <button className="primary compact" onClick={onClose}>完成</button>
        </div>
      </div>
    </div>
  );
}

// ============ Interruption Dialog ============

export function FocusInterruptionDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const presets = ["喝水", "上厕所", "接电话", "回消息", "其他"];
  return (
    <div className="modal-overlay" role="dialog" aria-label="专注打断">
      <div className="modal-card focus-interruption">
        <h2>记录打断</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          为什么暂停了？选一个或自己写。
        </p>
        <div className="chip-row" style={{ marginTop: 10 }}>
          {presets.map((p) => (
            <button
              key={p}
              className={reason === p ? "chip active" : "chip"}
              onClick={() => setReason(p)}
            >
              {p}
            </button>
          ))}
        </div>
        <input
          className="field"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="或输入其他原因..."
          style={{ marginTop: 10 }}
        />
        <div className="focus-completion-actions">
          <button className="ghost-btn compact" onClick={onCancel}>
            <X size={14} /> 取消
          </button>
          <button
            className="primary compact"
            onClick={() => onConfirm(reason.trim() || "手动暂停")}
          >
            确认打断
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ Custom Duration Dialog ============

export function CustomFocusDurationDialog({
  onConfirm,
  onCancel,
  initialMinutes = 30,
  minMinutes = 1,
  maxMinutes = 180,
}: {
  onConfirm: (minutes: number) => void;
  onCancel: () => void;
  initialMinutes?: number;
  minMinutes?: number;
  maxMinutes?: number;
}) {
  const [minutes, setMinutes] = useState(initialMinutes);
  return (
    <div className="modal-overlay" role="dialog" aria-label="自定义时长">
      <div className="modal-card focus-custom-duration">
        <h2>自定义时长</h2>
        <div className="step-control" style={{ marginTop: 12 }}>
          <button onClick={() => setMinutes(Math.max(minMinutes, minutes - 5))}>-</button>
          <span className="step-value">{minutes} 分钟</span>
          <button onClick={() => setMinutes(Math.min(maxMinutes, minutes + 5))}>+</button>
        </div>
        <input
          type="range"
          min={minMinutes}
          max={maxMinutes}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
          style={{ width: "100%", marginTop: 10 }}
        />
        <div className="focus-completion-actions">
          <button className="ghost-btn compact" onClick={onCancel}>取消</button>
          <button className="primary compact" onClick={() => onConfirm(minutes)}>确定</button>
        </div>
      </div>
    </div>
  );
}

// ============ DND Guide ============

export function FocusDoNotDisturbGuide({
  onEnable,
  onSkip,
}: {
  onEnable: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="modal-overlay" role="dialog" aria-label="勿扰模式">
      <div className="modal-card focus-dnd-guide">
        <h2>开启勿扰模式？</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
          专注时自动屏蔽系统通知，避免被消息打扰。可以随时在设置中关闭。
        </p>
        <div className="focus-completion-actions">
          <button className="ghost-btn compact" onClick={onSkip}>暂不</button>
          <button className="primary compact" onClick={onEnable}>开启</button>
        </div>
      </div>
    </div>
  );
}
