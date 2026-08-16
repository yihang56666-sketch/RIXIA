# RIXIA Maturity Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 RIXIA 从卡片堆叠的效率工具升级为统一、克制、跨端的个人节奏与学习工作台，并通过可替换 Provider 在可用平台复用 FocuBili 的学习能力。

**Architecture:** React/PWA 继续作为 RIXIA 的统一界面和本地数据层；新增 Plan/Library 组合视图、v2 数据迁移和 `LearningProvider` 接口。Web provider 在没有宿主能力时使用官方 B 站嵌入与本地进度，FocuBili 合体版通过宿主消息桥提供原生能力；UI 不依赖具体平台。

**Tech Stack:** React 19, TypeScript 5, Vite 7, Zustand 5, Lucide React, CSS custom properties, Vitest, Playwright, Capacitor 8, Flutter WebView/WebView2。

---

## 文件地图

- `src/types.ts`：路由、皮肤、课程资源、时间点笔记和应用状态类型。
- `src/catalog.ts`：导航、工具、皮肤目录和迁移映射。
- `src/lib/migrations.ts`：持久化 v1 到 v2 的纯函数迁移和导入校验。
- `src/lib/learning/`：学习 Provider 的接口、Web 实现、宿主桥实现和测试。
- `src/store/useAppStore.ts`：持久化版本、课程资源、播放进度和笔记动作。
- `src/components/Shell.tsx`：桌面侧栏、平板轨道、移动底部导航、快速捕获。
- `src/features/today/TodayView.tsx`：主行动、状态带、今日安排和继续学习。
- `src/features/plan/PlanView.tsx`：任务、习惯、考研和倒计时的组合视图。
- `src/features/library/LibraryView.tsx`：课程/视频、笔记和稍后处理资料库。
- `src/features/settings/SettingsView.tsx`：皮肤、密度、模块、备份和许可证信息。
- `src/styles/global.css`：三层材质、响应式布局、动效和皮肤令牌。
- `scripts/verify-responsive.mjs` 和 `scripts/capture-shots.mjs`：跨视口 Playwright 验收。
- `../focubili-src/lib/features/workbench/workbench_page.dart`：Android/iOS/Windows 工作台宿主加载与桥接。
- `../focubili-src/lib/features/workbench/rixia_bridge.dart`：FocuBili GPL 原生 Provider 的消息协议。
- `../focubili-src/THIRD_PARTY_NOTICES.md`：合体版许可证和第三方声明。

## Task 1: 固化 v2 数据和路由契约

**Files:**
- Create: `src/lib/migrations.ts`
- Create: `src/lib/migrations.test.ts`
- Modify: `src/types.ts`
- Modify: `src/catalog.ts`
- Modify: `src/store/useAppStore.ts`
- Test: `src/store/useAppStore.migration.test.ts`
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`

- [ ] **Step 1: 写迁移失败测试**

```ts
import { describe, expect, it } from "vitest";
import { migratePersistedState, validateBackup } from "../lib/migrations";

describe("persisted state v2 migration", () => {
  it("maps v1 videos and themes without changing existing ids", () => {
    const result = migratePersistedState({
      theme: "paper",
      videos: [{ id: "v1", bvid: "BV1", title: "课", addedAt: "2026-08-01T00:00:00.000Z" }],
      tasks: [{ id: "t1", title: "读书", done: false, due: null, createdAt: "2026-08-01T00:00:00.000Z" }],
    }, 1);
    expect(result.version).toBe(2);
    expect(result.theme).toBe("porcelain");
    expect(result.resources[0]).toMatchObject({ id: "v1", bvid: "BV1", status: "saved" });
    expect(result.tasks[0].id).toBe("t1");
  });

  it("rejects backups without an array of tasks", () => {
    expect(() => validateBackup({ data: { notes: [] } })).toThrow("有效的 RIXIA");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/lib/migrations.test.ts`

Expected: FAIL because `migratePersistedState` and `validateBackup` do not exist.

- [ ] **Step 3: 增加类型和纯迁移函数**

在 `src/types.ts` 增加 `plan`、`library` 两个 `ViewKey`，将皮肤键扩展为 `porcelain | graphite | sage | aurora | rosewood | mono | ocean | ember | lavender | ink | system`，并增加：

```ts
export type ResourceStatus = "saved" | "in-progress" | "completed";

export interface CourseResource {
  id: string;
  bvid: string;
  title: string;
  status: ResourceStatus;
  addedAt: string;
  lastOpenedAt?: string;
  progressSeconds?: number;
  durationSeconds?: number;
}

export interface TimestampNote {
  id: string;
  resourceId: string;
  seconds: number;
  body: string;
  createdAt: string;
}

export interface ActiveFocus {
  startedAt: string;
  mode: "countdown" | "countup";
  resourceId?: string;
  episodeId?: string;
}
```

在 `src/lib/migrations.ts` 实现 `migratePersistedState(input: unknown, version: number): Partial<AppState> & { version: 2 }`，只使用对象/数组守卫；v1 的 `videos` 映射为 `resources`，旧主题映射到新皮肤，缺失数组补空数组，`activeFocus` 缺失时为 `null`。实现 `validateBackup(input: unknown): BackupData`，所有字段先经过数组检查，失败抛出中文错误。

- [ ] **Step 4: 接入 Zustand persist v2**

将 `name` 保持为 `rixia-v1` 以兼容已有用户，把 `version` 改为 `2`，`migrate` 委托给 `migratePersistedState`；新增 `resources`、`timestampNotes`、`activeFocus: null` 初始值和 `addResource`, `updateResourceProgress`, `addTimestampNote`, `removeTimestampNote`, `setActiveFocus` 动作。运行 `npm install -D @testing-library/react @testing-library/jest-dom jsdom`，把三个包加入 devDependencies；`vitest.config.ts` 使用 `environment: "jsdom"` 和 `src/test/setup.ts`。

- [ ] **Step 5: 运行测试确认通过并提交**

Run: `npm test -- src/lib/migrations.test.ts src/store/useAppStore.migration.test.ts`

Expected: PASS. Commit: `git add src/types.ts src/catalog.ts src/lib/migrations.ts src/lib/migrations.test.ts src/store/useAppStore.ts src/store/useAppStore.migration.test.ts && git commit -m "feat: migrate RIXIA state to v2"`.

## Task 2: 建立材质皮肤和密度令牌

**Files:**
- Modify: `src/catalog.ts`
- Modify: `src/types.ts`
- Modify: `src/store/useAppStore.ts`
- Modify: `src/styles/global.css`
- Modify: `src/features/settings/SettingsView.tsx`
- Test: `src/lib/migrations.test.ts`

- [ ] **Step 1: 增加皮肤目录测试**

在迁移测试中断言 `THEMES` 包含 11 个键（10 套皮肤 + `system`），并断言旧 `paper`, `mist`, `matcha`, `sunset`, `ink`, `graphite`, `dusk`, `deep` 都有迁移映射。

- [ ] **Step 2: 替换主题目录和设置状态**

在 `catalog.ts` 为每个主题提供 `dark`, `swatch`, `material` 字段；`material` 取 `solid | translucent | high-contrast`。在状态中加入 `density: "comfortable" | "standard" | "compact"` 及 `setDensity`，默认 `standard`。

- [ ] **Step 3: 重写 CSS 令牌的层级**

保留现有选择器兼容性，但把主题变量集中为 `--app-bg`, `--nav-surface`, `--content-surface`, `--content-surface-strong`, `--text`, `--text-2`, `--line`, `--accent`, `--shadow-float`, `--blur-nav`；普通 `.card` 使用 `background: var(--content-surface-strong)`、`border: 1px solid var(--line)` 和不超过 `8px` 圆角，只有 `.sidebar`, `.tabbar`, `.modal`, `.palette` 使用 blur。加入：

```css
:root {
  --ease-out: cubic-bezier(.22, .61, .36, 1);
  --ease-spring: cubic-bezier(.2, .8, .2, 1);
}

[data-density="compact"] { --control-h: 36px; --section-gap: 14px; }
[data-density="standard"] { --control-h: 42px; --section-gap: 20px; }
[data-density="comfortable"] { --control-h: 48px; --section-gap: 26px; }
```

删除会让每个内容区都变成玻璃卡的重复阴影和 `backdrop-filter`，保留导航/弹层的模糊。为 `prefers-reduced-motion` 设置 transition/animation 最小化。

- [ ] **Step 4: 更新 Settings 皮肤和密度选择**

主题选择展示 11 个可见预览，新增分段控件选择舒展/标准/紧凑；使用 `data-theme` 和 `data-density`，不在组件内写固定颜色。

- [ ] **Step 5: 运行验证并提交**

Run: `npm test -- src/lib/migrations.test.ts && npm run typecheck && npm run build`

Expected: PASS. Commit: `git add src/catalog.ts src/types.ts src/store/useAppStore.ts src/styles/global.css src/features/settings/SettingsView.tsx src/lib/migrations.test.ts && git commit -m "feat: add material skins and density tokens"`.

## Task 3: 重构 Shell 和跨端导航

**Files:**
- Modify: `src/components/Shell.tsx`
- Modify: `src/catalog.ts`
- Modify: `src/App.tsx`
- Modify: `src/styles/global.css`
- Create: `src/components/CaptureButton.tsx`
- Test: `src/components/Shell.test.tsx`

- [ ] **Step 1: 写导航行为测试**

覆盖桌面导航 `today/plan/focus/library/settings`、移动底部五项、`Ctrl/Cmd+K` 打开面板和捕获按钮打开 `QuickAdd`。测试断言每个按钮 `aria-label` 与 `aria-current` 正确。

- [ ] **Step 2: 增加新路由分支**

在 `App.tsx` 添加 `PlanView` 和 `LibraryView` 分支，旧 `tasks`, `habits`, `notes`, `countdowns`, `videos` 仍可被命令面板直接打开，避免旧链接失效。

- [ ] **Step 3: 替换导航配置**

桌面 `MAIN_NAV` 使用今天、计划、专注、资料库；侧栏底部固定设置和捕获按钮。移动 `TAB_NAV` 使用今天、计划、专注、资料库、设置五项。当前路由使用 `aria-current="page"`，图标按钮继续来自 lucide-react。

- [ ] **Step 4: 修复安全区与固定栏布局**

为 `.view-stage` 增加 `padding-bottom: calc(24px + env(safe-area-inset-bottom))`；移动 `.tabbar` 使用 `bottom: max(12px, env(safe-area-inset-bottom))` 并为正文保留同等空间，禁止 fixed 元素覆盖最后一项内容。桌面/平板 breakpoint 分别为 768px 和 1200px。

- [ ] **Step 5: 测试和提交**

Run: `npm test -- src/components/Shell.test.tsx && npm run typecheck`

Expected: PASS. Commit: `git add src/components/Shell.tsx src/components/CaptureButton.tsx src/catalog.ts src/App.tsx src/styles/global.css src/components/Shell.test.tsx && git commit -m "feat: unify responsive RIXIA navigation"`.

## Task 4: 重做 Today 首页的信息层级

**Files:**
- Create: `src/lib/today.ts`
- Create: `src/lib/today.test.ts`
- Modify: `src/features/today/TodayView.tsx`
- Modify: `src/styles/global.css`

- [ ] **Step 1: 写主行动和摘要测试**

`src/lib/today.test.ts` 覆盖固定优先级：持久化 `activeFocus` > overdue/today task > recent unfinished resource > inbox > create task；覆盖零数据、完成任务和 7 天趋势文案。

- [ ] **Step 2: 提取纯摘要函数**

实现：

```ts
export type TodayAction =
  | { kind: "focus"; label: string }
  | { kind: "task"; taskId: string; label: string }
  | { kind: "resource"; resourceId: string; label: string }
  | { kind: "inbox"; label: string }
  | { kind: "create-task"; label: string };

export function chooseNextAction(input: TodayActionInput): TodayAction;
export function buildTodaySummary(input: TodaySummaryInput): TodaySummary;
```

- [ ] **Step 3: 用三层布局替换卡片墙**

`TodayView` 渲染 `.today-action`, `.status-strip`, `.today-columns` 三个区域。主行动按钮触发 `setView`, `setActiveFocus` 或 `QuickAdd`；状态带最多显示三项并支持横向滚动；今日任务和习惯使用轻边界列表；近 7 天回顾默认只显示摘要，使用按钮切换展开图表。

- [ ] **Step 4: 加入继续学习占位数据**

若 `resources` 存在未完成项，展示标题、进度条和“继续”按钮；没有资源时显示添加视频的内联入口，不再使用空白卡片。

- [ ] **Step 5: 跨视口验证并提交**

Run: `npm test -- src/lib/today.test.ts && npm run build`

Expected: PASS；通过现有 `scripts/capture-shots.mjs` 生成桌面/平板/390px 手机截图，人工检查首屏和固定栏。Commit: `git add src/lib/today.ts src/lib/today.test.ts src/features/today/TodayView.tsx src/styles/global.css && git commit -m "feat: redesign today as an action dashboard"`.

## Task 5: 组合 Plan 和 Library 页面

**Files:**
- Create: `src/features/plan/PlanView.tsx`
- Create: `src/features/library/LibraryView.tsx`
- Modify: `src/features/tasks/TasksView.tsx`
- Modify: `src/features/habits/HabitsView.tsx`
- Modify: `src/features/countdowns/CountdownsView.tsx`
- Modify: `src/features/notes/NotesView.tsx`
- Modify: `src/features/videos/VideosView.tsx`
- Modify: `src/styles/global.css`

- [ ] **Step 1: 写空/错误/部分数据测试**

为 Plan 和 Library 的筛选纯函数增加测试：按今天、逾期、习惯未打卡、课程状态筛选；空数据返回明确的可行动空态；资源加载错误不影响本地笔记列表。

- [ ] **Step 2: 实现 PlanView 标签和统一添加入口**

PlanView 使用 `segmented` 控件切换任务、习惯、考研、倒计时，直接复用现有领域组件的数据动作；标签切换不改写 URL 状态，组件卸载不丢编辑内容。

- [ ] **Step 3: 实现 LibraryView 分段和资源卡**

LibraryView 分为继续学习、已保存、笔记、收集箱；视频卡展示播放进度、最近打开时间、状态和删除菜单，不展示纯 BV 号作为主信息；点击资源通过 Provider 打开播放器。

- [ ] **Step 4: 收敛旧页面入口**

旧页面保留作为命令面板深链接，但增加返回 Plan/Library 的 `back-button`；VideosView 改为调用 Provider，不直接在列表层拼接播放器 URL。

- [ ] **Step 5: 测试和提交**

Run: `npm test -- src/features && npm run typecheck`

Expected: PASS. Commit: `git add src/features/plan src/features/library src/features/tasks src/features/habits src/features/countdowns src/features/notes src/features/videos src/styles/global.css && git commit -m "feat: combine planning and learning library"`.

## Task 6: 实现 LearningProvider 与 Web 降级

**Files:**
- Create: `src/lib/learning/types.ts`
- Create: `src/lib/learning/webProvider.ts`
- Create: `src/lib/learning/nativeProvider.ts`
- Create: `src/lib/learning/provider.ts`
- Create: `src/lib/learning/provider.test.ts`
- Modify: `src/features/library/LibraryView.tsx`
- Modify: `src/features/videos/VideosView.tsx`
- Modify: `src/types.ts`

- [ ] **Step 1: 写 Provider contract 测试**

测试 `createLearningProvider` 在 `window.rixiaNativeLearning` 存在时选择 native，不存在时选择 web；测试 malformed BV 输入返回结构化错误；测试播放器加载失败返回 `retry` 与 `externalUrl`。

- [ ] **Step 2: 定义接口和结构化状态**

接口与设计规格保持一致，补充：

```ts
export type ProviderErrorCode = "offline" | "invalid-input" | "unavailable" | "network";
export interface ProviderError { code: ProviderErrorCode; message: string; retryable: boolean; externalUrl?: string; }
export interface PlayerSession { resourceId: string; bvid: string; iframeUrl?: string; externalUrl: string; }
```

- [ ] **Step 3: 实现 Web provider**

复用 `src/lib/bilibili.ts` 的 `extractBvid`, `buildPlayerUrl`, `buildSearchUrl`；播放返回官方 iframe URL，进度通过 `postMessage` 监听播放器事件失败时保持本地进度，不读取未经允许的账号 Cookie。

- [ ] **Step 4: 实现 native provider 适配**

在浏览器端只调用 `window.rixiaNativeLearning.request(method, payload)`，超时 8 秒转换为 `ProviderError` 并回退 Web provider；任何来自宿主的字符串先 JSON.parse 并校验 `ok/data/error` 结构。

- [ ] **Step 5: 接入资料库和视频详情**

LibraryView 和 VideosView 通过 provider 打开/搜索，所有加载视图显示 loading/empty/error/partial 状态；播放器失败显示重试、在 B 站打开和复制链接三个动作。

- [ ] **Step 6: 运行测试并提交**

Run: `npm test -- src/lib/learning/provider.test.ts src/lib/bilibili.test.ts && npm run build`

Expected: PASS. Commit: `git add src/lib/learning src/features/library src/features/videos src/types.ts && git commit -m "feat: add provider-based learning playback"`.

## Task 7: 关联专注、播放进度和时间点笔记

**Files:**
- Modify: `src/types.ts`
- Modify: `src/store/useAppStore.ts`
- Modify: `src/features/focus/FocusView.tsx`
- Modify: `src/features/library/LibraryView.tsx`
- Create: `src/lib/learning/progress.test.ts`
- Modify: `src/styles/global.css`

- [ ] **Step 1: 写进度和关联测试**

覆盖播放进度百分比钳制到 0–100、资源完成状态、专注回合关联 resourceId、时间点笔记按 seconds 升序和空正文拒绝。

- [ ] **Step 2: 扩展 FocusSession 和动作**

新增可选 `resourceId`, `episodeId`；开始专注时保存当前资源，完成回合时更新资源进度；旧会话缺字段保持可读。

- [ ] **Step 3: 在播放器详情显示学习上下文**

播放器下方显示当前资源进度、关联专注目标和笔记时间点；无法读取原生时间时仍允许手动新增秒数笔记。

- [ ] **Step 4: 运行测试和提交**

Run: `npm test -- src/lib/learning/progress.test.ts src/store/useAppStore.focus.test.ts && npm run typecheck`

Expected: PASS. Commit: `git add src/types.ts src/store/useAppStore.ts src/features/focus src/features/library src/lib/learning/progress.test.ts src/styles/global.css && git commit -m "feat: link focus sessions to learning resources"`.

## Task 8: 在 FocuBili 合体工程实现宿主桥

**Files:**
- Modify: `../focubili-src/lib/features/workbench/workbench_page.dart`
- Create: `../focubili-src/lib/features/workbench/rixia_bridge.dart`
- Modify: `../focubili-src/pubspec.yaml`
- Modify: `../focubili-src/THIRD_PARTY_NOTICES.md`
- Test: `../focubili-src/test/features/workbench/rixia_bridge_test.dart`

- [ ] **Step 1: 写 Dart 协议测试**

测试请求 `{id, method, payload}` 的 JSON 编解码、未知 method 返回 `unavailable`、超时/空 payload 不抛出未处理异常，且响应不包含 Cookie、密码或原始请求头。

- [ ] **Step 2: 实现 RixiaBridge**

`RixiaBridge` 只暴露 `capabilities`, `search`, `resolve`, `openPlayer`, `getProgress`, `saveTimestampNote`；调用 FocuBili 现有公开内容/播放/笔记 service，返回 `{ok: true, data}` 或 `{ok: false, error: {code, message, retryable}}`。禁止把登录 Cookie 传给 JavaScript。

- [ ] **Step 3: 配置 WebView JavaScript channel**

Android/iOS 的 `webview_flutter` 使用单一 `rixiaNativeLearning` channel，页面发出 request 后由 Dart 回传同一个 `id`；消息大小限制 256KB；未知请求和 JSON 解析失败返回结构化错误。

- [ ] **Step 4: 补 Windows 工作台**

Windows 使用已有 `desktop_webview_window` 的 WebView2 能力创建 RIXIA 工作台窗口/页面；若 WebView2 不可用显示明确安装提示和浏览器打开入口，不再显示“Windows 不支持”的静态卡片。工作台窗口关闭时释放 channel 和临时 profile。

- [ ] **Step 5: 更新 GPL 声明和测试**

在 `THIRD_PARTY_NOTICES.md` 标明 RIXIA GPL 合体层、FocuBili GPL-3.0-only 和消息协议；运行 `flutter test test/features/workbench/rixia_bridge_test.dart` 与 `dart analyze`。Commit in FocuBili: `git add lib/features/workbench pubspec.yaml THIRD_PARTY_NOTICES.md test/features/workbench && git commit -m "feat: bridge native learning into RIXIA workbench"`.

## Task 9: 设置、备份和许可证体验

**Files:**
- Modify: `src/features/settings/SettingsView.tsx`
- Modify: `src/components/CommandPalette.tsx`
- Modify: `src/lib/migrations.ts`
- Modify: `src/styles/global.css`
- Modify: `README.md`

- [ ] **Step 1: 将备份格式升级为 v2**

导出字段包含 `formatVersion: 2`, `theme`, `density`, `resources`, `timestampNotes` 和现有领域数组；导入先调用 `validateBackup`，校验通过后一次性替换，不在部分失败时修改 store。

- [ ] **Step 2: 增加关于/许可证区块**

设置页展示 RIXIA 版本、FocuBili 合体版 GPL-3.0 说明、第三方声明链接和当前 Provider 能力；纯 Web 版不宣称拥有原生能力。

- [ ] **Step 3: 更新命令面板动作**

增加“切换密度”“打开计划”“打开资料库”“继续学习”命令；每个命令带 icon、键盘可达和当前状态，不将低频工具重新放回顶级导航。

- [ ] **Step 4: 测试和提交**

Run: `npm test -- src/lib/migrations.test.ts src/components/CommandPalette.test.tsx && npm run build`

Expected: PASS. Commit: `git add src/features/settings src/components/CommandPalette.tsx src/lib/migrations.ts src/styles/global.css README.md && git commit -m "feat: finish backup and license settings"`.

## Task 10: 跨端验收和发布构建

**Files:**
- Modify: `scripts/capture-shots.mjs`
- Create: `scripts/verify-responsive.mjs`
- Modify: `README.md`
- Generated: `output/shots/rixia-maturity-*.png`

- [ ] **Step 1: 增加 Playwright 视口矩阵**

使用 1440×900、1024×1366、390×844、360×800 四个视口，加载有任务、习惯、资源和空数据两种 fixture；每个视口断言 `document.documentElement.scrollWidth <= window.innerWidth`，最后一个正文元素的 bounding box 不与 tabbar 重叠。

- [ ] **Step 2: 生成截图并人工检查**

Run: `npm run dev -- --host 127.0.0.1`，另开终端执行 `node scripts/verify-responsive.mjs`。

Expected: 四个视口均通过；生成 Today、Plan、Focus、Library、Settings 截图；无横向滚动、文本裁切、固定栏遮挡或空白播放器。

- [ ] **Step 3: 运行完整 Web 验证**

Run: `npm test && npm run typecheck && npm run build`

Expected: all Vitest tests pass, TypeScript emits no errors, Vite production build succeeds.

- [ ] **Step 4: 运行 Android/Windows 能力验证**

Run in `clock`: `npm run mobile:sync`; run in `focubili-src`: `flutter pub get`, `dart analyze`, `flutter test`, `flutter build apk --debug`; when WebView2 toolchain is present also run `flutter build windows --debug`.

Expected: RIXIA assets load from Flutter, native capability probe returns a structured result, and unavailable Windows WebView2 shows a recoverable prompt. If the local Windows toolchain is absent, record the exact command and environment failure in `README.md` rather than claiming success.

- [ ] **Step 5: 完成审计**

检查 git diff、第三方许可证、四个视口截图和所有验收项；只在每项都有命令输出、截图或测试证据后更新 active goal 为 complete。
