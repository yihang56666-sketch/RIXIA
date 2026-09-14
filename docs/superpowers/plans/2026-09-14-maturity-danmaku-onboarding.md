# Maturity, Danmaku, And Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make danmaku a study signal, unify the mature visual system, and expand dynamic teaching to the core workflows.

**Architecture:** Add a pure danmaku study model and a focused player-side study panel. Keep the player coordinator responsible for playback time and visibility. Extend the existing feature map and tour engine rather than creating a second onboarding source of truth. Reuse the existing CSS tokens and add shared component patterns for layout and motion.

**Tech Stack:** React, TypeScript, Zustand, Vitest, Testing Library, existing CSS tokens, Lucide icons.

---

### Task 1: Danmaku study model

**Files:**
- Create: `src/lib/bilibili/danmakuStudyModel.ts`
- Test: `src/lib/bilibili/danmakuStudyModel.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_DANMAKU_PREFERENCES, DanmakuMode, type DanmakuEntry } from "./types";
import { buildDanmakuStudySummary, type DanmakuStudyConfig } from "./danmakuStudyModel";

const config: DanmakuStudyConfig = {
  windowSeconds: 12,
  highSignalLimit: 3,
  signalStrength: "standard",
};

function entry(text: string, startTimeSeconds: number, id = 1): DanmakuEntry {
  return {
    id,
    text,
    startTimeSeconds,
    durationSeconds: 6,
    mode: DanmakuMode.scrolling,
    color: 0xffffff,
    fontSize: 22,
    pool: 0,
    midHash: "",
  };
}

describe("buildDanmakuStudySummary", () => {
  it("ranks questions above low-information danmaku", () => {
    const result = buildDanmakuStudySummary(
      [entry("哈哈哈", 10, 1), entry("这里为什么要这样写？", 12, 2)],
      12,
      DEFAULT_DANMAKU_PREFERENCES,
      config,
    );

    expect(result.highSignalEntries[0]?.text).toBe("这里为什么要这样写？");
    expect(result.highSignalEntries[0]?.score).toBeGreaterThan(0);
  });

  it("excludes entries outside the nearby playback window", () => {
    const result = buildDanmakuStudySummary(
      [entry("现在的问题是什么？", 10, 1), entry("很远的问题是什么？", 120, 2)],
      10,
      DEFAULT_DANMAKU_PREFERENCES,
      config,
    );

    expect(result.highSignalEntries).toHaveLength(1);
    expect(result.highSignalEntries[0]?.text).toBe("现在的问题是什么？");
  });

  it("keeps the list deterministic and malformed-data safe", () => {
    const entries = [entry("怎么做这道题？", 20, 2), entry("怎么做这道题？", 21, 3), entry("哈哈", 20, 4)];
    const first = buildDanmakuStudySummary(entries, 20, DEFAULT_DANMAKU_PREFERENCES, config);
    const second = buildDanmakuStudySummary(entries, 20, DEFAULT_DANMAKU_PREFERENCES, config);
    const malformed = buildDanmakuStudySummary(undefined as unknown as DanmakuEntry[], 20, DEFAULT_DANMAKU_PREFERENCES, config);

    expect(first).toEqual(second);
    expect(malformed.highSignalEntries).toEqual([]);
    expect(first.highSignalEntries[0]?.text).toBe("怎么做这道题？");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/bilibili/danmakuStudyModel.test.ts`
Expected: FAIL because `danmakuStudyModel.ts` does not exist.

- [ ] **Step 3: Implement the model**

```ts
import type { DanmakuEntry, DanmakuPreferences } from "./types";

export type DanmakuStudyStrength = "standard" | "high";

export interface DanmakuStudyConfig {
  windowSeconds: number;
  highSignalLimit: number;
  signalStrength: DanmakuStudyStrength;
}

export interface DanmakuStudyEntry {
  id: number;
  text: string;
  startTimeSeconds: number;
  score: number;
}

export interface DanmakuStudySummary {
  windowLabel: string;
  totalCount: number;
  visibleCount: number;
  highSignalEntries: DanmakuStudyEntry[];
}

export const DEFAULT_DANMAKU_STUDY_CONFIG: DanmakuStudyConfig = {
  windowSeconds: 12,
  highSignalLimit: 5,
  signalStrength: "standard",
};

const QUESTION_CUES = ["?", "？", "为什么", "怎么", "如何", "吗", "什么"];
const TIMESTAMP_CUES = ["时间", "分钟", "秒", "第", "章", "节", "点"];
const LOW_INFORMATION_CUES = ["哈哈哈", "来了", "前方高能", "打卡", "赞", "顶"];

function clampNumber(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function scoreText(text: string, repetitions: number): number {
  let score = 1;
  if (QUESTION_CUES.some((cue) => text.includes(cue))) score += 5;
  if (TIMESTAMP_CUES.some((cue) => text.includes(cue))) score += 4;
  if (LOW_INFORMATION_CUES.some((cue) => text.includes(cue))) score -= 3;
  score += clampNumber((repetitions - 1) * 0.4, 0, 3);
  return score;
}

export function buildDanmakuStudySummary(
  entries: DanmakuEntry[] | null | undefined,
  currentTimeSeconds: number,
  preferences: DanmakuPreferences,
  config: DanmakuStudyConfig = DEFAULT_DANMAKU_STUDY_CONFIG,
): DanmakuStudySummary {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const time = clampNumber(currentTimeSeconds, 0, Number.MAX_SAFE_INTEGER);
  const windowSeconds = clampNumber(config.windowSeconds, 1, 120);
  const inWindow = safeEntries.filter((item) => {
    if (!item || typeof item.text !== "string" || !Number.isFinite(item.startTimeSeconds)) return false;
    if (preferences.blockedKeywords.some((keyword) => item.text.includes(keyword))) return false;
    return Math.abs(item.startTimeSeconds - time) <= windowSeconds;
  });

  const grouped = new Map<string, DanmakuStudyEntry & { repetitions: number }>();
  for (const item of inWindow) {
    const text = normalizeText(item.text);
    if (!text) continue;
    const key = text.toLowerCase();
    const current = grouped.get(key);
    if (current) {
      current.repetitions += 1;
      current.score = scoreText(text, current.repetitions);
      continue;
    }
    grouped.set(key, {
      id: item.id,
      text,
      startTimeSeconds: item.startTimeSeconds,
      score: scoreText(text, 1),
      repetitions: 1,
    });
  }

  const threshold = config.signalStrength === "high" ? 2 : 1;
  const highSignalEntries = Array.from(grouped.values())
    .filter((item) => item.score >= threshold)
    .sort((a, b) => b.score - a.score || a.startTimeSeconds - b.startTimeSeconds || a.id - b.id)
    .slice(0, clampNumber(config.highSignalLimit, 1, 10))
    .map(({ id, text, startTimeSeconds, score }) => ({ id, text, startTimeSeconds, score }));

  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return {
    windowLabel: `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")} 附近`,
    totalCount: safeEntries.length,
    visibleCount: inWindow.length,
    highSignalEntries,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/bilibili/danmakuStudyModel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/bilibili/danmakuStudyModel.ts src/lib/bilibili/danmakuStudyModel.test.ts
git commit -m "feat(danmaku): add study signal model"
```

### Task 2: Danmaku study panel

**Files:**
- Create: `src/features/bilibili/DanmakuStudyPanel.tsx`
- Test: `src/features/bilibili/DanmakuStudyPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_DANMAKU_PREFERENCES, DanmakuMode, type DanmakuEntry } from "../../lib/bilibili/types";
import { DanmakuStudyPanel } from "./DanmakuStudyPanel";

const entries: DanmakuEntry[] = [
  {
    id: 1,
    text: "这里为什么要这样写？",
    startTimeSeconds: 10,
    durationSeconds: 6,
    mode: DanmakuMode.scrolling,
    color: 0xffffff,
    fontSize: 22,
    pool: 0,
    midHash: "",
  },
];

describe("DanmakuStudyPanel", () => {
  it("shows the high-signal list and preferences link", () => {
    render(
      <DanmakuStudyPanel
        open
        entries={entries}
        currentTimeSeconds={10}
        preferences={DEFAULT_DANMAKU_PREFERENCES}
        loading={false}
        failed={false}
        onClose={vi.fn()}
        onOpenPreferences={vi.fn()}
      />,
    );

    expect(screen.getByText("这里为什么要这样写？")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开弹幕设置" })).toBeInTheDocument();
  });

  it("shows retry and empty states without blocking playback", () => {
    const onRetry = vi.fn();
    render(
      <DanmakuStudyPanel
        open
        entries={[]}
        currentTimeSeconds={10}
        preferences={DEFAULT_DANMAKU_PREFERENCES}
        loading={false}
        failed
        onClose={vi.fn()}
        onRetry={onRetry}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "重试读取弹幕" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/bilibili/DanmakuStudyPanel.test.tsx`
Expected: FAIL because `DanmakuStudyPanel` does not exist.

- [ ] **Step 3: Implement the panel**

```tsx
import { X } from "lucide-react";
import { buildDanmakuStudySummary, DEFAULT_DANMAKU_STUDY_CONFIG } from "../../lib/bilibili/danmakuStudyModel";
import type { DanmakuEntry, DanmakuPreferences } from "../../lib/bilibili/types";

interface DanmakuStudyPanelProps {
  open: boolean;
  entries: DanmakuEntry[];
  currentTimeSeconds: number;
  preferences: DanmakuPreferences;
  loading: boolean;
  failed: boolean;
  onClose: () => void;
  onRetry?: () => void;
  onOpenPreferences?: () => void;
}

export function DanmakuStudyPanel({
  open,
  entries,
  currentTimeSeconds,
  preferences,
  loading,
  failed,
  onClose,
  onRetry,
  onOpenPreferences,
}: DanmakuStudyPanelProps) {
  if (!open) return null;
  const summary = buildDanmakuStudySummary(entries, currentTimeSeconds, preferences, {
    ...DEFAULT_DANMAKU_STUDY_CONFIG,
    highSignalLimit: 5,
    signalStrength: "standard",
  });

  return (
    <aside className="danmaku-study-panel" role="dialog" aria-label="弹幕学习模式">
      <header className="danmaku-study-head">
        <div>
          <strong>弹幕学习</strong>
          <span>{summary.windowLabel}</span>
        </div>
        <button className="danmaku-study-close" onClick={onClose} aria-label="关闭弹幕学习模式">
          <X size={14} />
        </button>
      </header>
      <div className="danmaku-study-body">
        {loading && <p>正在读取弹幕</p>}
        {!loading && failed && (
          <>
            <p>弹幕数据还没读到，学习摘要暂时不可用。</p>
            {onRetry && (
              <button className="danmaku-study-action" onClick={onRetry}>重试读取弹幕</button>
            )}
          </>
        )}
        {!loading && !failed && summary.visibleCount === 0 && (
          <p>当前位置没有弹幕。可以把疑问先记到时间点笔记里。</p>
        )}
        {!loading && !failed && summary.visibleCount > 0 && summary.highSignalEntries.length === 0 && (
          <p>这一段没有发现明显的问题或时间点信号。</p>
        )}
        {!loading && !failed && summary.highSignalEntries.length > 0 && (
          <ul className="danmaku-study-list">
            {summary.highSignalEntries.map((item) => (
              <li key={item.id}>
                <span>{item.text}</span>
                <small>{item.startTimeSeconds.toFixed(0)}s</small>
              </li>
            ))}
          </ul>
        )}
      </div>
      <footer className="danmaku-study-foot">
        {onOpenPreferences && (
          <button className="danmaku-study-action" onClick={onOpenPreferences} aria-label="打开弹幕设置">
            弹幕设置
          </button>
        )}
      </footer>
    </aside>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/bilibili/DanmakuStudyPanel.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/bilibili/DanmakuStudyPanel.tsx src/features/bilibili/DanmakuStudyPanel.test.tsx
git commit -m "feat(danmaku): add study panel"
```

### Task 3: Player integration

**Files:**
- Modify: `src/features/bilibili/BilibiliPlayerView.tsx`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Add state and import**

In `BilibiliPlayerView.tsx`, add the import near the other player components:

```tsx
import { DanmakuStudyPanel } from "./DanmakuStudyPanel";
```

Near the existing `showPrefs` state, add:

```tsx
const [showStudy, setShowStudy] = useState(false);
const [studyStrength, setStudyStrength] = useState<"standard" | "high">("standard");
```

- [ ] **Step 2: Add the study entry and panel**

Next to the existing danmaku settings button in the player topbar, add:

```tsx
<button
  className="fb-player-topbar-btn"
  onClick={() => setShowStudy((v) => !v)}
  aria-label="弹幕学习模式"
  title="弹幕学习模式"
  data-tour-target="player-danmaku-study"
>
  <GraduationCap size={18} />
</button>
```

After the existing `showDanmakuCoach` block, add:

```tsx
<DanmakuStudyPanel
  open={showStudy}
  entries={danmaku}
  currentTimeSeconds={currentTime}
  preferences={prefs}
  loading={danmakuStatus === "loading"}
  failed={danmakuFailed}
  onClose={() => setShowStudy(false)}
  onRetry={() => setDanmakuReload((count) => count + 1)}
  onOpenPreferences={() => setShowPrefs(true)}
/>
```

Also import `GraduationCap` from `lucide-react`.

- [ ] **Step 3: Add CSS**

Append to `global.css`:

```css
.danmaku-study-panel {
  position: absolute;
  top: 64px;
  right: 16px;
  z-index: 40;
  width: min(300px, calc(100vw - 32px));
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  max-height: min(420px, calc(100% - 88px));
  padding: 12px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--m3-surface-container-high, #fff) 96%, transparent);
  border: 1px solid color-mix(in srgb, var(--m3-outline-variant, #cac4d0) 52%, transparent);
  box-shadow: 0 18px 44px rgba(9, 14, 30, 0.2);
  animation: overlayIn 0.24s var(--ease-out) both;
}

.danmaku-study-head,
.danmaku-study-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.danmaku-study-head strong {
  font-size: 14px;
}

.danmaku-study-head span {
  margin-left: 8px;
  color: var(--m3-on-surface-variant, #57565c);
  font-size: 12px;
}

.danmaku-study-body {
  margin-top: 10px;
  overflow: auto;
}

.danmaku-study-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.danmaku-study-list li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--m3-surface-container-low, #f7f7fa) 90%, transparent);
  font-size: 13px;
  line-height: 1.4;
}

.danmaku-study-action {
  min-height: 30px;
  border: 0;
  border-radius: 9px;
  padding: 6px 10px;
  color: #fff;
  background: var(--focubili-blue);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: transform 140ms var(--ease-out), filter 160ms var(--ease-out);
}

.danmaku-study-close {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: pointer;
  transition: transform 140ms var(--ease-out), background 160ms var(--ease-out);
}

.danmaku-study-close:hover,
.danmaku-study-action:hover { filter: brightness(1.05); }
.danmaku-study-close:active,
.danmaku-study-action:active { transform: scale(0.96); }

@media (max-width: 720px) {
  .danmaku-study-panel {
    top: auto;
    bottom: 76px;
    right: 10px;
    width: min(320px, calc(100vw - 20px));
  }
}

@media (prefers-reduced-motion: reduce) {
  .danmaku-study-panel {
    animation: none !important;
  }
}
```

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run src/features/bilibili/DanmakuStudyPanel.test.tsx src/lib/bilibili/danmakuStudyModel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/bilibili/BilibiliPlayerView.tsx src/styles/global.css
git commit -m "feat(danmaku): integrate study mode into player"
```

### Task 4: Layout and motion maturity

**Files:**
- Modify: `src/features/bilibili/FocusDashboard.tsx`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Reorder home cards by primary intent**

In `FocusDashboard`, update the mobile `coreCards` order so the active/ready focus card is visually first when present, followed by continue learning:

```tsx
const coreCards = (
  <>
    {finishedSession && (
      <FinishedCard session={finishedSession} onClose={timer.dismissLastFinishedSession} />
    )}
    {activeSession ? (
      <ActiveCard
        session={activeSession}
        remainingMs={timer.remainingMs}
        progress={timer.progress}
        onPause={() => void pauseWithEncouragement()}
        onResume={() => continueFocus(activeSession)}
        onEnd={() => setShowTermination(true)}
        onExtend={() => void extendFocus()}
        onOpenLinkedVideo={() => openLinkedVideo(activeSession)}
      />
    ) : (
      <ReadyCard
        goal={goal}
        onGoalChange={setGoal}
        selectedMinutes={selectedMinutes}
        onSelectMinutes={setSelectedMinutes}
        onSelectCustom={() => setShowCustomDuration(true)}
        onStart={() => void startFocus()}
        onOpenVideo={openSearch}
      />
    )}
    {continueEntry && (
      <ContinueLearningCard
        entry={continueEntry}
        loading={learningListLoading}
        onOpen={continueLearning}
        onOpenList={openLearningList}
      />
    )}
    <TodaySummaryCard
      focusedMinutes={Math.floor(timer.todayFocusedMs / 60_000)}
      completedCount={timer.todayCompletedCount}
    />
    <RecentHistoryCard history={timer.history} />
    <KaoyanTodayCard onOpen={() => setView("kaoyan")} />
    <HomeIntentGroups onOpen={setView} onOpenStatistics={onOpenStatistics} />
  </>
);
```

Also update the mobile cards container to use:

```tsx
<div style={cardsStyle}>
  {timer.ready ? coreCards : (
    <section className="m3-card" style={{ padding: 32, display: "grid", placeItems: "center" }}>
      <span className="m3-circular-progress lg" />
    </section>
  )}
</div>
```

- [ ] **Step 2: Unify motion and compact surfaces**

Append to `global.css`:

```css
.primary-card {
  border-radius: 18px;
  padding: 20px;
  background: color-mix(in srgb, var(--m3-surface-container-high, #fff) 96%, transparent);
  border: 1px solid color-mix(in srgb, var(--m3-outline-variant, #cac4d0) 48%, transparent);
  box-shadow: 0 14px 36px rgba(9, 14, 30, 0.1);
}

.compact-item {
  min-height: 44px;
  display: grid;
  align-items: center;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--m3-surface-container-low, #f7f7fa) 88%, transparent);
  border: 1px solid color-mix(in srgb, var(--m3-outline-variant, #cac4d0) 34%, transparent);
}

.motion-rise {
  animation: fadeUp 0.22s var(--ease-out) both;
}

.motion-card {
  animation: fadeUp 0.3s var(--ease-out) both;
}

.motion-dialog {
  animation: popIn 0.24s var(--ease-spring) both;
}

.motion-feedback {
  transition: transform 140ms var(--ease-out), filter 140ms var(--ease-out);
}
```

Then apply `primary-card` to `ContinueLearningCard`, `ReadyCard`, and `ActiveCard`; apply `compact-item` to `RecentHistoryCard` rows; apply `motion-card` to core cards and `motion-feedback` to primary action buttons.

- [ ] **Step 3: Improve launch sequence**

In `App.tsx`, keep the current launch state, but change the overlay markup to include a hidden action emphasis marker:

```tsx
<div className={launching ? "launch-overlay active" : "launch-overlay"} aria-hidden={!launching}>
  <img src="/beid-icon.png" alt="" />
  <span>BEID</span>
  <i className="launch-focus" aria-hidden="true" />
</div>
```

Append to `global.css`:

```css
.launch-focus {
  width: 4px;
  height: 4px;
  margin-top: 8px;
  border-radius: 50%;
  background: var(--focubili-blue, #2563eb);
  opacity: 0;
  animation: launchFocus 0.54s var(--ease-apple, cubic-bezier(0.32, 0.72, 0, 1)) 0.22s both;
}

@keyframes launchFocus {
  from { opacity: 0; transform: scale(0.6); }
  to { opacity: 1; transform: scale(1); }
}
```

Then extend the existing reduced-motion rule:

```css
@media (prefers-reduced-motion: reduce) {
  .launch-focus {
    animation: none !important;
  }
}
```

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run src/features/bilibili/FocusDashboard.test.tsx src/App.theme.test.tsx src/App.storage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/bilibili/FocusDashboard.tsx src/styles/global.css src/App.tsx
git commit -m "feat(ui): unify mature layout and motion"
```

### Task 5: Teaching center and danmaku tour

**Files:**
- Modify: `src/features/tour/featureTourTasks.ts`
- Modify: `src/features/tour/featureMapCatalog.ts`
- Modify: `src/features/tour/FeatureMapDialog.tsx`

- [ ] **Step 1: Add danmaku tour steps**

In `featureTourTasks.ts`, update the task id type:

```ts
export type TourTaskId = "watch" | "focus" | "review" | "organize" | "backup" | "danmaku";
```

Add a new task to `TOUR_TASKS`:

```ts
danmaku: [
  {
    view: "bilibili-player",
    label: "弹幕",
    title: "打开或关闭弹幕",
    description: "点常驻弹幕按钮，把弹幕切到你喜欢的状态。",
    target: "player-danmaku-toggle",
  },
  {
    view: "bilibili-player",
    label: "弹幕",
    title: "打开学习模式",
    description: "点弹幕学习按钮，查看当前片段的问题和时间点。",
    target: "player-danmaku-study",
  },
  {
    view: "bilibili-player",
    label: "弹幕",
    title: "看高信号摘要",
    description: "学习面板会把提问和时间点放在最前面。",
    target: "danmaku-study-body",
  },
],
```

- [ ] **Step 2: Add danmaku to feature catalog**

In `featureMapCatalog.ts`, import `MessageSquare` from `lucide-react`, then add this entry to the existing `watch` category:

```ts
{
  id: "watch-danmaku-study",
  title: "弹幕学习",
  purpose: "把弹幕变成问题和时间点信号。",
  how: "在播放页打开弹幕学习，按片段查看高信号内容。",
  route: "bilibili-player",
  icon: MessageSquare,
  tourTaskId: "danmaku",
},
```

- [ ] **Step 3: Clarify teaching copy**

In `FeatureMapDialog.tsx`, update the dialog header and footer copy:

```tsx
<h2>教学中心</h2>
<p>先看要做什么，再点对应功能开始教学或直达页面。</p>
```

Also change the dialog `aria-label` from `"功能地图"` to `"教学中心"`.

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run src/features/tour/featureMapCatalog.test.ts src/features/tour/FeatureMapDialog.test.tsx src/features/tour/FeatureTour.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/tour/featureTourTasks.ts src/features/tour/featureMapCatalog.ts src/features/tour/FeatureMapDialog.tsx
git commit -m "feat(onboarding): expand teaching center"
```

### Task 6: Verification

**Files:**
- Verify only

- [ ] **Step 1: Run full tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 2: Run type check**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Cross-viewport check**

Run: `node scripts/verify-cross-viewport.mjs`
Expected: PASS

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "chore(ui): danmaku and onboarding maturity"
```
