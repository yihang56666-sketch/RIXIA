import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDailyQuote } from "../../lib/dailyQuotes";
import { todayKey } from "../../lib/time";
import { createTourService } from "../../lib/tourService";
import { useAppStore } from "../../store/useAppStore";
import { TOUR_TASKS, type TourStep, type TourTaskId } from "./featureTourTasks";

export const TOUR_PALETTE_OPEN_EVENT = "beid:tour-open-palette";
export const TOUR_PALETTE_OPENED_EVENT = "beid:tour-palette-opened";
export const TOUR_REPLAY_EVENT = "beid:tour-replay";

interface TourStepWithPalette extends TourStep {
  openPalette?: boolean;
}

const TOUR_STEPS: TourStepWithPalette[] = [
  {
    view: "focus-dashboard",
    label: "欢迎",
    title: "用几个要点认识 BEID",
    description: "我会带你走过首页、搜索、资料库、每日语录和命令面板。",
  },
  {
    view: "focus-dashboard",
    label: "首页",
    title: "从这里开始搜索",
    description: "点击下方「开始搜索」或顶部的搜索按钮，进入视频搜索。",
    target: "home-search",
  },
  {
    view: "search",
    label: "搜索",
    title: "真正搜你想看的内容",
    description: "在这个输入框里输入关键词、BV 号或视频链接，回车即可搜索。",
    target: "search-input",
  },
  {
    view: "library",
    label: "资料库",
    title: "所有课程都集中在这里",
    description: "继续学习、已保存和笔记都在资料库，点封面就会进入全屏播放器。",
    target: "library-nav",
  },
  {
    view: "focus-dashboard",
    label: "播放器",
    title: "播放页不只是能看视频",
    description: "视频上有滚动弹幕，右上角常驻弹幕按钮可以随时开关；控制条里还能调字号、透明度、显示区域和屏蔽词。",
  },
  {
    view: "focus-dashboard",
    label: "专注",
    title: "把一次观看变成一次专注",
    description: "进任意视频后点「专注观看」，观看时间会进入专注计时；也可以回到首页先开专注再选视频。",
  },
  {
    view: "today",
    label: "每日语录",
    title: "每天一句，保持节奏",
    description: "「今日」会按日期给出一句话，提醒你把今天过扎实。",
    target: "daily-quote",
  },
  {
    view: "focus-dashboard",
    label: "命令面板",
    title: "一键到达任何页面",
    description: "底部「命令」或左上角图标会打开命令面板，试试搜索或者切换主题。",
    openPalette: true,
    target: "palette-trigger",
  },
  {
    view: "settings",
    label: "我的",
    title: "账号、设置与备份",
    description: "在「我的」里登录账号、管理学习列表、设置主题和备份数据。",
    target: "settings-nav",
  },
];

function elementRect(target: string): DOMRect | null {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour-target="${target}"]`));
  const node =
    nodes.find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(candidate).display !== "none";
    }) ?? nodes[0];
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0 ? rect : null;
}

function nextStep(completedSteps: number[], totalSteps: number): number | null {
  for (let index = 0; index < totalSteps; index += 1) {
    if (!completedSteps.includes(index)) return index;
  }
  return null;
}

/** 清除已完成的巡览进度并让 FeatureTour 重新从第一步开始。 */
export function restartTourPlayback(storage: Storage = localStorage): void {
  try {
    storage.setItem(
      "rixia_feature_tour_v1",
      JSON.stringify({ completedSteps: [], dismissed: false, updatedAt: new Date().toISOString() }),
    );
  } catch {
    // 存储不可用时只保留内存状态，replay 事件仍会让巡览重新出现。
  }
  window.dispatchEvent(new Event(TOUR_REPLAY_EVENT));
}

export function FeatureTour({ initialTask }: { initialTask?: TourTaskId }) {
  const service = useMemo(() => createTourService(), []);
  const setView = useAppStore((state) => state.setView);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [spotlight, setSpotlight] = useState<DOMRect | null>(null);
  const advanceRef = useRef<() => void>(() => {});
  const steps: TourStep[] = initialTask ? TOUR_TASKS[initialTask] : TOUR_STEPS;

  useEffect(() => {
    if (initialTask) {
      setActiveIndex(0);
      return;
    }
    const state = service.load();
    setActiveIndex(service.isFinished(state, steps.length) ? null : nextStep(state.completedSteps, steps.length));
  }, [initialTask, service, steps]);

  // 「我的 → 功能教学」随时可以重播巡览：清除完成/跳过状态并从第一步开始。
  useEffect(() => {
    const onReplay = () => {
      setView("focus-dashboard");
      setActiveIndex(0);
    };
    window.addEventListener(TOUR_REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(TOUR_REPLAY_EVENT, onReplay);
  }, [setView]);

  const advance = useCallback(() => {
    setActiveIndex((current) => {
      if (current === null) return null;
      const next = current + 1;
      if (next >= steps.length) {
        service.dismiss();
        return null;
      }
      service.completeStep(current);
      const nextStep = steps[next];
      setView(nextStep.view);
      if (nextStep.openPalette) {
      window.dispatchEvent(new Event(TOUR_PALETTE_OPEN_EVENT));
      }
      return next;
    });
  }, [initialTask, service, setView, steps]);
  advanceRef.current = advance;

  useEffect(() => {
    if (activeIndex === null) return;
    const step = steps[activeIndex];
    setView(step.view);
    const updateSpotlight = () => {
      setSpotlight(step.target ? elementRect(step.target) : null);
    };
    updateSpotlight();
    const timer = window.setTimeout(updateSpotlight, 80);
    window.addEventListener("resize", updateSpotlight);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", updateSpotlight);
    };
  }, [activeIndex, setView, steps]);

  // 走到目标上的真实按钮/输入框时，点击目标也算一次"我完成了"。
  useEffect(() => {
    if (activeIndex === null) return;
    const step = steps[activeIndex];
    if (!step.target || step.openPalette) return;
    const advance = advanceRef.current;
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const highlighted = target.closest(`[data-tour-target="${step.target}"]`);
      if (!highlighted) return;
      const clickedInside: Element[] = Array.from(
        highlighted.querySelectorAll("*"),
      ).filter((node) => node === target || node.contains(target));
      if (clickedInside.length > 0 || target === highlighted) {
        advance();
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [activeIndex, steps]);

  // 命令面板由 Shell 打开；真实打开后这一步行成为"已看到"。
  useEffect(() => {
  if (activeIndex === null || !(steps[activeIndex] as TourStepWithPalette)?.openPalette) return undefined;
    const onOpened = () => advanceRef.current();
    window.addEventListener(TOUR_PALETTE_OPENED_EVENT, onOpened);
    return () => window.removeEventListener(TOUR_PALETTE_OPENED_EVENT, onOpened);
  }, [activeIndex]);

  if (activeIndex === null) return null;
  const step = steps[activeIndex];
  const quote = getDailyQuote(todayKey());

  return (
    <div className="feature-tour" data-testid="feature-tour">
      <div className="feature-tour-veil" aria-hidden="true" />
      {step.target && spotlight && !step.openPalette && (
        <div
          className="feature-tour-spotlight"
          aria-hidden="true"
          style={{
            left: spotlight.left,
            top: spotlight.top,
            width: spotlight.width,
            height: spotlight.height,
          }}
        />
      )}
      <aside
        className="feature-tour-card feature-tour-welcome"
        role="dialog"
        aria-label={step.label}
        data-tour-active={step.view}
      >
        <div className="feature-tour-heading">
          <Sparkles size={16} />
          <span>{step.label}{activeIndex + 1}/{steps.length}</span>
        </div>
        <h2>{step.title}</h2>
        <p>{step.description}</p>
        {activeIndex === 0 && (
          <blockquote className="feature-tour-quote">
            “{quote.text}”
            <span>{quote.source}</span>
          </blockquote>
        )}
        <div className="feature-tour-actions">
          <button
            className="feature-tour-skip"
            onClick={() => {
              service.dismiss();
              setActiveIndex(null);
            }}
            aria-label="跳过巡览"
          >
            暂时不看
          </button>
          <button className="feature-tour-next" onClick={advance}>
            {activeIndex === 0 ? "开始巡览" : activeIndex === steps.length - 1 ? "完成" : "下一步"}
          </button>
        </div>
      </aside>
    </div>
  );
}
