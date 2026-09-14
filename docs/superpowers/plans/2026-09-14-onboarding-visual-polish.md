# Onboarding And Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the static walkthrough into task-based onboarding, add a feature map, and make the shell feel more intentional.

**Architecture:** Keep the existing store and view router. Add a feature map catalog and dialog on top of existing routes. Extend `FeatureTour` to accept task step sets and real target completion. Adjust the home screen into grouped intent sections and add a small launch/transition layer.

**Tech Stack:** React, TypeScript, Zustand, Vitest, Testing Library, existing CSS tokens and M3 surfaces.

---

### Task 1: Feature map catalog

**Files:**
- Create: `src/features/tour/featureMapCatalog.ts`
- Test: `src/features/tour/featureMapCatalog.test.ts`

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { FEATURE_MAP_CATEGORIES } from "./featureMapCatalog";

describe("feature map catalog", () => {
  it("groups entries by intent and keeps stable ids", () => {
    expect(FEATURE_MAP_CATEGORIES.map((category) => category.id)).toEqual([
      "watch",
      "focus",
      "review",
      "organize",
      "system",
    ]);
    const ids = FEATURE_MAP_CATEGORIES.flatMap((category) => category.items.map((item) => item.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every entry purpose, route and how-to copy", () => {
    const entries = FEATURE_MAP_CATEGORIES.flatMap((category) => category.items);
    expect(entries.length).toBeGreaterThan(8);
    for (const entry of entries) {
      expect(entry.title).toBeTruthy();
      expect(entry.purpose).toBeTruthy();
      expect(entry.how).toBeTruthy();
      expect(entry.route).toBeTruthy();
    }
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/tour/featureMapCatalog.test.ts`
Expected: FAIL because `featureMapCatalog.ts` does not exist.

- [x] **Step 3: Implement the catalog**

Create `src/features/tour/featureMapCatalog.ts`:

```ts
import {
  BookOpen,
  CalendarDays,
  Flame,
  Hourglass,
  Inbox,
  ListTodo,
  MonitorPlay,
  Search,
  Settings,
  StickyNote,
  Timer,
} from "lucide-react";
import type { ViewKey } from "../../types";

export type FeatureMapCategoryId = "watch" | "focus" | "review" | "organize" | "system";

export interface FeatureMapEntry {
  id: string;
  title: string;
  purpose: string;
  how: string;
  route: ViewKey;
  icon: typeof Search;
  tourTaskId?: string;
}

export interface FeatureMapCategory {
  id: FeatureMapCategoryId;
  title: string;
  purpose: string;
  items: FeatureMapEntry[];
}

export const FEATURE_MAP_CATEGORIES: FeatureMapCategory[] = [
  {
    id: "watch",
    title: "看课",
    purpose: "找到视频、继续学习、边看边记。",
    items: [
      {
        id: "watch-search",
        title: "搜索视频",
        purpose: "按关键词、BV 号或链接找课。",
        how: "在搜索框输入内容，回车后点封面进入播放器。",
        route: "search",
        icon: Search,
        tourTaskId: "watch",
      },
      {
        id: "watch-library",
        title: "资料库",
        purpose: "集中管理继续学习和已保存内容。",
        how: "从资料库点封面回到上次的视频位置。",
        route: "library",
        icon: MonitorPlay,
      },
      {
        id: "watch-learning-list",
        title: "学习清单",
        purpose: "跟踪每一节课的完成状态。",
        how: "在清单里打开视频或标记已完成。",
        route: "learning-list",
        icon: BookOpen,
      },
      {
        id: "watch-video-notes",
        title: "时间点笔记",
        purpose: "把疑问记在视频的具体时间点。",
        how: "播放页添加笔记，资料库随时回看。",
        route: "video-notes",
        icon: StickyNote,
      },
    ],
  },
  {
    id: "focus",
    title: "专注",
    purpose: "把一段时间留给明确目标。",
    items: [
      {
        id: "focus-start",
        title: "开始专注",
        purpose: "写下目标和时长，开始一次专注。",
        how: "首页选择目标、时长，点开始专注。",
        route: "focus-dashboard",
        icon: Timer,
        tourTaskId: "focus",
      },
      {
        id: "focus-statistics",
        title: "专注数据",
        purpose: "回看专注时长和完成节奏。",
        how: "从首页打开专注数据。",
        route: "focus-statistics",
        icon: Timer,
      },
    ],
  },
  {
    id: "review",
    title: "复习",
    purpose: "把错题、任务和考试倒计时收在一起。",
    items: [
      {
        id: "review-kaoyan",
        title: "考研计划",
        purpose: "管理科目、错题、复习队列和模考。",
        how: "进入考研页，添加或完成复习项。",
        route: "kaoyan",
        icon: BookOpen,
        tourTaskId: "review",
      },
      {
        id: "review-tasks",
        title: "任务",
        purpose: "把要做的事排成明确一步。",
        how: "快速添加任务，完成后勾选。",
        route: "tasks",
        icon: ListTodo,
      },
      {
        id: "review-countdowns",
        title: "倒计时",
        purpose: "让重要日期一直可见。",
        how: "添加标题和日期，首页自动提醒。",
        route: "countdowns",
        icon: Hourglass,
      },
    ],
  },
  {
    id: "organize",
    title: "整理",
    purpose: "留住灵感、日记和每日坚持。",
    items: [
      {
        id: "organize-notes",
        title: "笔记",
        purpose: "随手记下想法和资料。",
        how: "输入内容后保存，随时搜索回看。",
        route: "notes",
        icon: StickyNote,
        tourTaskId: "organize",
      },
      {
        id: "organize-inbox",
        title: "收集箱",
        purpose: "先把想法放进来，稍后再整理。",
        how: "记录后一键转成今天的任务。",
        route: "inbox",
        icon: Inbox,
      },
      {
        id: "organize-journal",
        title: "日记",
        purpose: "按天记录学习状态和复盘。",
        how: "选择日期，写完自动保存。",
        route: "journal",
        icon: CalendarDays,
      },
      {
        id: "organize-habits",
        title: "习惯",
        purpose: "每天打卡，建立稳定节奏。",
        how: "创建习惯，今天完成后点打卡。",
        route: "habits",
        icon: Flame,
      },
    ],
  },
  {
    id: "system",
    title: "数据与系统",
    purpose: "备份、诊断和维护应用。",
    items: [
      {
        id: "system-profile",
        title: "我的",
        purpose: "登录账号、设置主题和备份数据。",
        how: "进入我的页面，选择对应操作。",
        route: "settings",
        icon: Settings,
        tourTaskId: "backup",
      },
      {
        id: "system-about",
        title: "关于",
        purpose: "查看版本、更新和系统信息。",
        how: "从我的页面进入关于。",
        route: "about",
        icon: Settings,
      },
    ],
  },
];
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/tour/featureMapCatalog.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/features/tour/featureMapCatalog.ts src/features/tour/featureMapCatalog.test.ts
git commit -m "feat(onboarding): add feature map catalog"
```

### Task 2: Feature map dialog

**Files:**
- Create: `src/features/tour/FeatureMapDialog.tsx`
- Test: `src/features/tour/FeatureMapDialog.test.tsx`

- [x] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FeatureMapDialog } from "./FeatureMapDialog";

describe("FeatureMapDialog", () => {
  it("renders grouped feature cards", () => {
    render(<FeatureMapDialog open onClose={vi.fn()} onStartTour={vi.fn()} />);
    expect(screen.getByText("看课")).toBeInTheDocument();
    expect(screen.getByText("找到视频、继续学习、边看边记。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /搜索视频/ })).toBeInTheDocument();
  });

  it("opens the selected route and tour task", async () => {
    const onStartTour = vi.fn();
    render(<FeatureMapDialog open onClose={vi.fn()} onStartTour={onStartTour} />);
    await userEvent.click(screen.getByRole("button", { name: /搜索视频/ }));
    expect(onStartTour).toHaveBeenCalledWith("watch");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/tour/FeatureMapDialog.test.tsx`
Expected: FAIL because `FeatureMapDialog` does not exist.

- [x] **Step 3: Implement the dialog**

Create `src/features/tour/FeatureMapDialog.tsx`:

```tsx
import { X } from "lucide-react";
import { FEATURE_MAP_CATEGORIES } from "./featureMapCatalog";

interface FeatureMapDialogProps {
  open: boolean;
  onClose: () => void;
  onStartTour: (taskId?: string) => void;
}

export function FeatureMapDialog({ open, onClose, onStartTour }: FeatureMapDialogProps) {
  if (!open) return null;

  return (
    <div className="feature-map-overlay" role="presentation" onClick={onClose}>
      <section
        className="feature-map-card"
        role="dialog"
        aria-modal="true"
        aria-label="功能地图"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="feature-map-head">
          <div>
            <h2>功能地图</h2>
            <p>先看要做什么，再点对应功能。</p>
          </div>
          <button className="feature-map-close" onClick={onClose} aria-label="关闭功能地图">
            <X size={16} />
          </button>
        </header>
        <div className="feature-map-grid">
          {FEATURE_MAP_CATEGORIES.map((category) => (
            <section key={category.id} className="feature-map-section">
              <h3>{category.title}</h3>
              <p>{category.purpose}</p>
              <div className="feature-map-items">
                {category.items.map((item) => (
                  <button
                    key={item.id}
                    className="feature-map-item"
                    onClick={() => {
                      onStartTour(item.tourTaskId);
                    }}
                    aria-label={`${item.title} · ${item.purpose}`}
                  >
                    <span className="feature-map-item-icon">
                      <item.icon size={16} />
                    </span>
                    <span className="feature-map-item-body">
                      <strong>{item.title}</strong>
                      <span>{item.purpose}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/tour/FeatureMapDialog.test.tsx`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/features/tour/FeatureMapDialog.tsx src/features/tour/FeatureMapDialog.test.tsx
git commit -m "feat(onboarding): add feature map dialog"
```

### Task 3: Task-based tour

**Files:**
- Create: `src/features/tour/featureTourTasks.ts`
- Modify: `src/features/tour/FeatureTour.tsx`
- Test: `src/features/tour/FeatureTour.test.tsx`

- [x] **Step 1: Write the failing test**

```tsx
it("starts the selected tour task", () => {
  render(<FeatureTour initialTask="watch" />);
  expect(screen.getByText("从这里开始搜索")).toBeInTheDocument();
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/tour/FeatureTour.test.tsx`
Expected: FAIL because `initialTask` is not supported.

- [x] **Step 3: Add task step sets**

Create `src/features/tour/featureTourTasks.ts`:

```ts
export type TourTaskId = "watch" | "focus" | "review" | "organize" | "backup";

export interface TourStep {
  view: string;
  label: string;
  title: string;
  description: string;
  target?: string;
}

export const TOUR_TASKS: Record<TourTaskId, TourStep[]> = {
  watch: [
    {
      view: "focus-dashboard",
      label: "看课",
      title: "从首页找到入口",
      description: "点搜索或继续学习，进入视频。",
      target: "home-search",
    },
    {
      view: "search",
      label: "搜索",
      title: "输入要学的内容",
      description: "关键词、BV 号或链接都可以，回车搜索。",
      target: "search-input",
    },
    {
      view: "bilibili-player",
      label: "播放器",
      title: "在这里看课",
      description: "点播放器进入全屏或用弹幕控制。",
      target: "player-fullscreen",
    },
    {
      view: "bilibili-player",
      label: "弹幕",
      title: "弹幕随时可开关",
      description: "点常驻弹幕按钮控制显示。",
      target: "player-danmaku-toggle",
    },
  ],
  focus: [
    {
      view: "focus-dashboard",
      label: "专注",
      title: "写下目标",
      description: "先填一个明确目标。",
      target: "focus-goal",
    },
    {
      view: "focus-dashboard",
      label: "专注",
      title: "选择时长",
      description: "25、45、60 分钟或自定义。",
      target: "focus-duration",
    },
    {
      view: "focus-dashboard",
      label: "专注",
      title: "开始一次专注",
      description: "点开始专注后计时会自动开始。",
      target: "focus-start",
    },
  ],
  review: [
    {
      view: "kaoyan",
      label: "复习",
      title: "进入考研计划",
      description: "这里管理科目、错题和复习队列。",
      target: "kaoyan-review",
    },
    {
      view: "kaoyan",
      label: "复习",
      title: "完成今天的复习",
      description: "点复习项标记记得或不记得。",
      target: "review-queue",
    },
  ],
  organize: [
    {
      view: "notes",
      label: "整理",
      title: "添加一条笔记",
      description: "输入想法，点保存。",
      target: "notes-input",
    },
    {
      view: "notes",
      label: "整理",
      title: "保存后可回看",
      description: "笔记会按时间排列。",
      target: "notes-list",
    },
  ],
  backup: [
    {
      view: "settings",
      label: "数据",
      title: "进入我的页面",
      description: "这里管理账号和备份。",
      target: "settings-nav",
    },
    {
      view: "preferences",
      label: "备份",
      title: "导出或导入数据",
      description: "导出文件保存到本机。",
      target: "backup-export",
    },
  ],
};
```

- [x] **Step 4: Support initial task in FeatureTour**

Modify `FeatureTour` props:

```tsx
interface FeatureTourProps {
  initialTask?: TourTaskId;
}
```

When `initialTask` is provided, initialize `steps = TOUR_TASKS[initialTask]` and `activeIndex = 0`. Otherwise keep the existing first-run steps.

- [x] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/features/tour/FeatureTour.test.tsx`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/features/tour/featureTourTasks.ts src/features/tour/FeatureTour.tsx src/features/tour/FeatureTour.test.tsx
git commit -m "feat(onboarding): add task-based tour"
```

### Task 4: Target markers and home grouping

**Files:**
- Modify: `src/features/bilibili/FocusDashboard.tsx`
- Modify: `src/features/kaoyan/KaoyanView.tsx`
- Modify: `src/features/notes/NotesView.tsx`
- Modify: `src/features/settings/SettingsView.tsx`
- Modify: `src/styles/global.css`

- [x] **Step 1: Add target markers**

Add these stable attributes to the relevant controls:

```tsx
data-tour-target="focus-goal"
data-tour-target="focus-duration"
data-tour-target="focus-start"
data-tour-target="kaoyan-review"
data-tour-target="review-queue"
data-tour-target="notes-input"
data-tour-target="notes-list"
data-tour-target="backup-export"
```

- [x] **Step 2: Group home content**

In `FocusDashboard`, replace the flat helper-entry list with grouped sections:

```tsx
<section className="home-intent-group">
  <h3>继续看课</h3>
  <p>找到视频、继续学习、边看边记。</p>
  <div className="home-intent-actions">
    <button className="ghost-btn compact" onClick={openLearningList}>学习清单</button>
    <button className="ghost-btn compact" onClick={() => setView("search")}>搜索</button>
  </div>
</section>
```

Repeat for 专注, 复习, 整理, 数据与系统.

- [x] **Step 3: Add styles**

Append to `global.css`:

```css
.home-intent-group {
  padding: 14px 16px;
  border-radius: 14px;
  background: var(--surface-2);
}

.home-intent-group h3 {
  font-size: 15px;
  font-weight: 700;
}

.home-intent-group p {
  margin-top: 4px;
  color: var(--muted);
  font-size: 13px;
}

.home-intent-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
```

- [x] **Step 4: Run focused tests**

Run: `npx vitest run src/features/bilibili/FocusDashboard.test.tsx src/features/kaoyan/KaoyanView.test.tsx src/features/notes/NotesView.test.tsx src/features/settings/SettingsView.test.tsx`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/features/bilibili/FocusDashboard.tsx src/features/kaoyan/KaoyanView.tsx src/features/notes/NotesView.tsx src/features/settings/SettingsView.tsx src/styles/global.css
git commit -m "feat(ui): group home and add tour targets"
```

### Task 5: Launch animation and transition polish

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles/global.css`

- [x] **Step 1: Add launch state**

In `App`, add:

```tsx
const [launching, setLaunching] = useState(true);

useEffect(() => {
  const timer = window.setTimeout(() => setLaunching(false), 620);
  return () => window.clearTimeout(timer);
}, []);
```

- [x] **Step 2: Add launch overlay**

Inside the root `div`, add:

```tsx
<div className={launching ? "launch-overlay active" : "launch-overlay"} aria-hidden={!launching}>
  <img src="/beid-icon.png" alt="" />
  <span>BEID</span>
</div>
```

- [x] **Step 3: Add styles**

Append to `global.css`:

```css
.launch-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 10px;
  background: var(--bg-base);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.34s var(--ease-apple);
}

.launch-overlay.active {
  opacity: 1;
  pointer-events: auto;
}

.launch-overlay img {
  width: 54px;
  height: 54px;
  border-radius: 16px;
  animation: launchMark 0.54s var(--ease-apple) both;
}

.launch-overlay span {
  color: var(--text-2);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0;
  animation: fadeUp 0.34s var(--ease-out) both;
}

@keyframes launchMark {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}
```

- [x] **Step 4: Run app tests**

Run: `npx vitest run src/App.theme.test.tsx src/App.storage.test.tsx`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/App.tsx src/styles/global.css
git commit -m "feat(ui): add launch animation"
```

### Task 6: Verification

**Files:**
- Verify only

- [x] **Step 1: Run full tests**

Run: `npm test`
Expected: PASS

- [x] **Step 2: Run type check**

Run: `npm run typecheck`
Expected: PASS

- [x] **Step 3: Build**

Run: `npm run build`
Expected: PASS

- [x] **Step 4: Cross-viewport check**

Run: `node scripts/verify-cross-viewport.mjs`
Expected: PASS

- [x] **Step 5: Commit final fixes**

```bash
git add .
git commit -m "chore(ui): onboarding polish"
```

