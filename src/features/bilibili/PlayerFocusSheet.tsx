/**
 * 播放器专注面板 — 1:1 React 移植自 FocuBili 的 player_focus_sheet.dart（468 行）。
 *
 * 提供播放器内开始和控制专注的底部面板：
 * - Ready 态：目标输入 + 时长选择（25 分钟 / 自定义 / 45 分钟 / 当前分P完播结束）+ 开始按钮
 * - Active 态：倒计时（跟随分P时显示"等待当前分P完播"）+ 进度条 + 暂停/继续 + 续时 + 结束
 */

import { useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { FocusSessionStatus } from "../../lib/bilibili/focusSessionModel";
import { FocusInterruptionKind } from "../../lib/bilibili/focusSessionModel";
import { createFocusPreferencesService } from "../../lib/bilibili/focusServices";
import { Mi, useM3Feedback } from "./m3";
import { useFocusTimer } from "./useFocusTimer";
import { CustomFocusDurationDialog, FocusInterruptionFlow, FocusTerminationDialog } from "./FocusDialogs";
import { PlayerFocusDoNotDisturbGuide, usePlayerFocusDoNotDisturbGuide } from "./FocusOnboardingGuides";

const MAX_GOAL_CHARS = 60;

type DurationChoice = "twentyFive" | "fortyFive" | "part" | "custom";

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatPartDuration(remainingSeconds: number): string {
  const minutes = Math.max(1, Math.min(180, Math.ceil(remainingSeconds / 60)));
  return `当前分P（完播结束，约 ${minutes} 分）`;
}

export function PlayerFocusSheet({
  defaultGoal,
  partRemainingSeconds,
  bvid,
  videoTitle,
  partCid,
  partPageNumber,
  partTitle,
  videoIsPlaying,
  sourceFramePath,
  sourcePositionMs,
  onClose,
}: {
  defaultGoal: string;
  partRemainingSeconds: number;
  bvid: string;
  videoTitle: string;
  partCid: number;
  partPageNumber: number;
  partTitle: string;
  videoIsPlaying: boolean;
  sourceFramePath?: string;
  sourcePositionMs: number;
  onClose: () => void;
}) {
  const timer = useFocusTimer();
  const showMessage = useM3Feedback().showMessage;
  const [goal, setGoal] = useState(defaultGoal);
  const [choice, setChoice] = useState<DurationChoice>("twentyFive");
  const [customMinutes, setCustomMinutes] = useState(25);
  const [showCustomDialog, setShowCustomDialog] = useState(false);
  const [showInterruption, setShowInterruption] = useState(false);
  const [showTermination, setShowTermination] = useState(false);
  const [starting, setStarting] = useState(false);
  const goalRef = useRef(goal);
  goalRef.current = goal;

  const activeSession = timer.activeSession;
  const paused = activeSession?.status === FocusSessionStatus.paused;
  const guide = usePlayerFocusDoNotDisturbGuide(Boolean(activeSession));

  function selectedDurationMs(): number {
    switch (choice) {
      case "twentyFive":
        return 25 * 60_000;
      case "fortyFive":
        return 45 * 60_000;
      case "part":
        return Math.max(60_000, partRemainingSeconds * 1000);
      case "custom":
        return customMinutes * 60_000;
    }
  }

  async function startFocus() {
    if (starting) return;
    setStarting(true);
    try {
      const started = await timer.startFocus({
        goal: goalRef.current.trim(),
        durationMs: selectedDurationMs(),
        startImmediately: videoIsPlaying,
        sourceBvid: bvid,
        sourceVideoTitle: videoTitle,
        sourcePartCid: partCid,
        sourcePartPageNumber: partPageNumber,
        sourcePartTitle: partTitle,
        sourceFramePath,
        sourcePositionMs,
        completeOnPartEnd: choice === "part",
      });
      if (!started) {
        showMessage("请填写目标；当前分P剩余时间需在 1 到 180 分钟内。");
      } else {
        await handleDoNotDisturbAfterFocusStart();
      }
    } finally {
      setStarting(false);
    }
  }

  async function handleDoNotDisturbAfterFocusStart() {
    const service = createFocusPreferencesService();
    const prefs = await service.load();
    if (!prefs.enableDoNotDisturb) return;
    const isAndroid = Capacitor.getPlatform() === "android";
    if (isAndroid) {
      showMessage("视频播放时已进入勿扰；暂停或专注结束后会恢复原设置");
      return;
    }
    if (typeof navigator !== "undefined" && /Win/i.test(navigator.userAgent)) {
      showMessage("Windows 系统专注需要手动启动，请在“时钟”中开启");
      return;
    }
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      showMessage("专注期间将通过浏览器通知提醒");
    }
  }

  async function extendFiveMinutes() {
    const extended = await timer.extendFocus(5 * 60_000);
    if (!extended) {
      showMessage("计划总时长最多为 180 分钟。");
    }
  }

  async function confirmEndFocus(reason: string) {
    setShowTermination(false);
    await timer.endFocusEarly(reason);
  }

  const canStart = timer.ready && goal.trim().length > 0;

  return (
    <>
      <div className="fb-player-sheet-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="fb-player-sheet" role="dialog" aria-label="播放器专注">
          <div className="fb-player-sheet-handle" />
          <div className="fb-player-sheet-head">
            <strong className="fb-player-sheet-title">播放器专注</strong>
            <button className="m3-icon-btn" onClick={onClose} aria-label="关闭" title="关闭">
              <Mi name="close" />
            </button>
          </div>
          <p className="fb-player-sheet-subtitle">
            {videoTitle} · P{partPageNumber} {partTitle}
          </p>

          {!activeSession ? (
            <div className="fb-player-sheet-body">
              <label className="m3-field m3-field-floating" style={{ marginBottom: 16 }}>
                <input
                  type="text"
                  value={goal}
                  maxLength={MAX_GOAL_CHARS}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder=" "
                />
                <label>本次专注目标</label>
              </label>
              <div className="fb-player-sheet-chips">
                <button
                  className={choice === "twentyFive" ? "m3-chip selected" : "m3-chip"}
                  onClick={() => setChoice("twentyFive")}
                >
                  25 分钟
                </button>
                <button
                  className={choice === "custom" ? "m3-chip selected" : "m3-chip"}
                  onClick={() => setShowCustomDialog(true)}
                >
                  {choice === "custom" ? `${customMinutes} 分钟` : "自定义"}
                </button>
                <button
                  className={choice === "fortyFive" ? "m3-chip selected" : "m3-chip"}
                  onClick={() => setChoice("fortyFive")}
                >
                  45 分钟
                </button>
                <button
                  className={choice === "part" ? "m3-chip selected" : "m3-chip"}
                  onClick={() => setChoice("part")}
                >
                  {formatPartDuration(partRemainingSeconds)}
                </button>
              </div>
              <button
                className="m3-filled-btn full"
                style={{ marginTop: 18 }}
                disabled={!canStart || starting}
                onClick={() => void startFocus()}
              >
                <Mi name="timer" size={18} /> 开始专注
              </button>
            </div>
          ) : (
            <div className="fb-player-sheet-body">
              <p className="fb-player-sheet-goal">{activeSession.goal}</p>
              <p className="fb-player-sheet-countdown">
                {activeSession.completeOnPartEnd
                  ? `等待当前分P完播 · ${formatCountdown(timer.remainingMs)}`
                  : formatCountdown(timer.remainingMs)}
              </p>
              <div className="m3-linear-progress" style={{ margin: "8px 0 18px" }}>
                <div style={{ width: `${Math.round(timer.progress * 100)}%` }} />
              </div>
              <div className="fb-player-sheet-actions">
                <button
                  className="m3-filled-btn"
                  onClick={() => void (paused ? timer.resumeFocus() : setShowInterruption(true))}
                >
                  <Mi name={paused ? "play_arrow" : "pause"} size={18} /> {paused ? "继续" : "暂停"}
                </button>
                <button className="m3-outlined-btn" onClick={() => void extendFiveMinutes()}>
                  <Mi name="more_time" size={18} /> +5 分钟
                </button>
                <button className="m3-text-btn" onClick={() => setShowTermination(true)}>
                  <Mi name="stop" size={18} /> 结束
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showCustomDialog && (
        <CustomFocusDurationDialog
          initialMinutes={customMinutes}
          onCancel={() => setShowCustomDialog(false)}
          onConfirm={(minutes) => {
            setCustomMinutes(minutes);
            setChoice("custom");
            setShowCustomDialog(false);
          }}
        />
      )}
      {showInterruption && (
        <FocusInterruptionFlow
          kind={FocusInterruptionKind.manualPause}
          onDone={() => setShowInterruption(false)}
        />
      )}
      {showTermination && (
        <FocusTerminationDialog
          onCancel={() => setShowTermination(false)}
          onConfirm={(reason) => void confirmEndFocus(reason)}
        />
      )}
      {guide.visible && (
        <PlayerFocusDoNotDisturbGuide onDismiss={guide.dismiss} />
      )}
    </>
  );
}