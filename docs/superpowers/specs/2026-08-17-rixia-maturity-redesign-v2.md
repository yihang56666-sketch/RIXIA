# RIXIA 成熟化改版 v2：质感升级与开源能力融合

日期：2026-08-17（基于 `2026-08-17-rixia-maturity-redesign.md` 修订）

## 0. 修订背景

上一版 spec 在数据迁移、皮肤目录、LearningProvider 接口上做了正确决策，但执行只完成一半：

- **CSS 与 catalog 已脱钩**：`catalog.ts` 已经迁移到 11 个新皮肤键（porcelain/graphite/sage/…），但 `src/styles/global.css` 仍然使用旧键（paper/mist/matcha/sunset/ink/graphite/dusk/deep）。结果：除默认 `:root` 外所有皮肤都失效，深色模式几乎不可用。
- **塑料感来源已确认**：每个 `.card` 都有 `backdrop-filter: blur saturate(170%)` + `box-shadow`，每个卡片 hover 都 `translateY(-3px)` + `box-shadow-lg`。这就是用户说的「塑料感重」——每个区域都像一张悬浮玻璃卡，主次被抹平。
- **Shell 还停在旧导航**：当前 `MAIN_NAV` 是 Today/Inbox/Kaoyan/Settings 四项，移动 `TAB_NAV` 是 Today/Inbox/Tools/Kaoyan/Settings 五项。spec 要求的 Today/Plan/Focus/Library/Settings 五目的地尚未落地。
- **OSS 调研已在 `docs/inspirations.md` 完成**：Loop Habit Tracker、Super Productivity、Pomotroid、Things 3、Obsidian/Logseq/Joplin 都已评估，部分能力（30 天强度环、热力图、命令面板、周环比）已采纳。本次聚焦尚未采纳的部分。

本版 spec 不重写已有决策，只补齐：皮肤 CSS 重写、塑料感修复、Shell 五目的地、Today 重构、Plan/Library 合并、OSS 未采纳能力移植、FocuBili 桥、跨端验收。

## 1. 已确认方向（不变）

- 统一 RIXIA + 可替换 LearningProvider。
- React/PWA 继续作为统一界面与本地数据层。
- FocuBili 合体版通过宿主消息桥提供原生搜索/播放/进度/笔记。
- 许可证边界：FocuBili GPL-3.0-only 派生代码只进入明确标记的原生适配层。

## 2. 本次新增的 OSS 能力融合

基于 `docs/inspirations.md` 已调研但尚未采纳的部分：

### 2.1 来自 Loop Habit Tracker（GPL-3.0）— 数据模型借鉴，不复制代码

- **灵活频率类型**：当前习惯只有"每日打卡"。新增 `frequency: { type: "daily" | "weekly-count" | "interval-days"; target?: number; interval?: number }`，支持"每周 3 次"、"每 3 天 1 次"。
- **颜色 per 习惯**：每个习惯可指定颜色，热力图与列表都使用该色。
- **习惯提醒时间**（可选）：仅作为元数据存储，本地通知由宿主桥负责（无原生桥时静默忽略）。
- 不引入 Loop 的 Android 原生代码，仅借鉴数据结构与 UX。

### 2.2 来自 Super Productivity（MIT）— 专注循环增强

- **可配置回合循环**：`focusRounds: { workMinutes: number; shortBreakMinutes: number; longBreakMinutes: number; longBreakEvery: number }`，默认 25/5/15/4。
- **自动衔接**：完成一个专注回合后自动进入休息，休息结束自动开始下一回合（可暂停）。
- **今日专注计划**：基于 `focusGoalMinutes` 与回合长度计算"还需 N 个回合"。
- 不复制 Super Productivity 的 Angular 代码，仅借鉴 UX 与数据结构。

### 2.3 来自 usememos/memos（MIT）+ AFFiNE（MIT 前端）— 日记页与 markdown

许可证调研结论：Joplin / Logseq / SiYuan 都是 AGPL-3.0，**不采纳其代码**。usememos/memos（MIT，React+TS 前端）与 AFFiNE（MIT 前端）可借鉴 UX 与数据模型。

- **日记页（Daily Journal）**：自动为每天创建一页，头部固定展示"今日完成任务 + 习惯打卡 + 专注分钟"，下方是自由 markdown 正文。这是对当前 Notes 的升级，不是新增独立模块。理由：RIXIA 已有任务/习惯/专注，日记页是把三者串成"一天的故事"的缺失叙事层。
- **Markdown 渲染**：使用 `react-markdown`（MIT，gzip ~30KB），支持标题、列表、代码、链接、`- [ ]` 复选框。不引入 CodeMirror/ProseMirror/Quill。
- **`#tag` 解析**：在笔记/日记正文中 `#标签` 自动解析为可筛选的 chip。
- **`[[wiki 链接]]` 自动补全**：`[[` 触发对现有笔记/任务/习惯标题的补全。仅解析跳转，不做反向链接图谱（PKM 太重）。
- 不复制 memos/AFFiNE 代码，仅采纳数据模型与 UX。

### 2.4 来自 Things 3（商业，仅设计哲学）

- **渐进式披露**：默认只显示"下一步行动 + 三项核心指标 + 首个今日事项"，其余展开按需。
- **零摩擦编辑**：所有列表项点击即编辑，不弹模态。
- 不复制任何代码。

## 3. 塑料感修复（核心）

### 3.1 三层材质系统

页面只使用三种空间层级：

| 层 | 用途 | 材质 | 模糊 |
|---|---|---|---|
| 应用背景 | `body` / `.app-background` | 纯色或带极轻纹理 | 无 |
| 导航表面 | `.sidebar` / `.tabbar` / `.page-head` | 半透明 + 轻模糊 | `blur(20px) saturate(1.2)` |
| 内容表面 | `.card` / 列表项 / 表单 | 实色或 ≤4% 透明 | **无** |

**禁止**：普通内容卡使用 `backdrop-filter`、`box-shadow` 同时存在。内容卡只允许 `background: var(--content-surface-strong)` + `border: 1px solid var(--line)`。

### 3.2 阴影纪律

- 阴影只用于：模态、弹出层、命令面板、底部栏（轻投影）、选中态（accent 描边而非阴影）。
- 删除所有 `.card`、`.tool-card`、`.stat-tile`、`.countdown-card`、`.note-card` 的 `box-shadow` 与 `:hover { translateY }`。
- 仅 `.primary` 按钮、`tab.active`、`side-item.active` 允许 accent 描边或轻 glow。

### 3.3 圆角令牌

```
--radius-sm: 6px;   /* 输入框、按钮、列表项内部元素 */
--radius-md: 8px;   /* 卡片、表单区块 */
--radius-lg: 12px;  /* 模态、底部栏 */
--radius-xl: 16px;  /* 大型浮层 */
```

普通内容卡不超过 `--radius-md`。

### 3.4 动效纪律

- 视图切换：220ms 淡入 + 8px 位移，`--ease-out`。
- 列表项新增/完成/折叠：局部 layout 动画，不重复整页入场。
- 按钮：`transform: scale(0.98)` + 亮度反馈，120ms。
- 悬停反馈：仅在 `@media (hover: hover) and (pointer: fine)` 下启用。
- `@media (prefers-reduced-motion: reduce)` 下所有 transition/animation ≤ 1ms。
- 计时器和进度环更新保持尺寸固定，避免每秒跳动。

### 3.5 字体与密度

- 系统字体栈：`-apple-system, "SF Pro Text", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif`。
- 等宽数字：`font-variant-numeric: tabular-nums` 用于计时器、进度百分比、统计数字。
- 字号不随视口缩放。固定层级：hero 28px / h1 22px / h2 18px / body 15px / caption 13px / micro 11px。
- 密度三档（已在 catalog 中定义）通过 `data-density` 属性切换 `--control-h` 与 `--section-gap`。

## 4. 皮肤 CSS 重写（修复脱钩）

### 4.1 当前问题

`global.css` 的 `:root[data-theme="paper"]` 等选择器使用旧键，但 catalog 已迁移到新键。除默认 `:root`（被 porcelain 兜底）外，所有皮肤切换后视觉不变。

### 4.2 重写策略

- 删除所有旧主题选择器（paper/mist/matcha/sunset/dusk/deep）。
- 为 11 个新皮肤键各写一组令牌：`--bg-base`、`--bg-tint-1`、`--bg-tint-2`、`--surface`、`--surface-strong`、`--text`、`--text-2`、`--text-3`、`--line`、`--accent`、`--accent-deep`、`--accent-soft`、`--good`、`--danger`、`--shadow`、`--shadow-lg`、`--glow`、`--material`（solid/translucent/high-contrast）。
- `data-theme="system"` 通过 `@media (prefers-color-scheme)` 在 porcelain 与 graphite 之间切换。
- 每个皮肤的 `mood` 描述与 catalog `mood` 字段对齐。

### 4.3 皮肤材质差异

不仅换色，材质也变：

- **solid**（porcelain/graphite/sage/rosewood/ocean/ember/lavender/ink）：内容表面实色，无模糊。
- **translucent**（aurora）：内容表面 6% 透明 + 极轻模糊，仅用于主题强调区域。
- **high-contrast**（mono/ink）：纯黑白，无模糊无渐变，最大可读性。

## 5. 产品信息架构（落地执行）

### 5.1 五目的地导航

替换当前 `MAIN_NAV` 与 `TAB_NAV`：

```
桌面 MAIN_NAV: 今天 / 计划 / 专注 / 资料库 / 设置
移动 TAB_NAV:  今天 / 计划 / 专注 / 资料库 / 设置
```

- 收集箱（Inbox）不再占顶级位，改为全局浮动捕获按钮 + 命令面板入口。
- 工具（Tools）页移除，工具作为 Plan 内的标签呈现。
- 考研作为 Plan 内的标签，不再单独占位。

### 5.2 Plan 视图

`PlanView` 使用 segmented 控件切换：任务 / 习惯 / 考研 / 倒计时。每个标签复用现有领域组件的数据动作，不重写。

### 5.3 Library 视图

`LibraryView` 分段：继续学习 / 已保存 / 笔记 / 收集箱。

- 继续学习：未完成 `CourseResource`，展示进度条 + 最近打开时间。
- 已保存：所有资源，可删除、改状态。
- 笔记：现有 NoteItem 列表 + 新的日记入口。
- 收集箱：现有 InboxItem，可转为任务或笔记。

## 6. Today 重构

三层布局（已在原 spec 中定义，此处细化）：

### 6.1 主行动区（`.today-action`）

单一"下一步"按钮，固定优先级：

1. 进行中的 `activeFocus` → "继续专注"
2. 逾期或今日到期的首个未完成任务 → "开始：{任务标题}"
3. 最近 7 天看过但未完成的 `CourseResource` → "继续看：{资源标题}"
4. 非空 `inbox` → "整理 {N} 条收集"
5. 兜底 → "创建今日任务"

用户可手动切换候选项（左右箭头），应用不随机推荐。

### 6.2 状态带（`.status-strip`）

横向滚动的紧凑指标：任务完成 X/Y、习惯 X/Y、专注 X/Y 分钟、收集箱 N、最近倒计时。

- 每项 ≤ 120px 宽，点击进入对应视图。
- 移动端首屏最多显示 3 项，其余横向滚动。
- 不使用阴影卡，仅 1px 分隔。

### 6.3 情境内容区（`.today-columns`）

桌面/平板双栏，移动单栏：

- **今日安排**：按 due 时间排序的任务 + 今日应学的考研单元，可直接勾选完成。
- **继续学习**：最近 3 个未完成资源，进度条 + 上次观看时间。
- **节奏回顾**：默认一句趋势摘要（"本周专注比上周多 23%"），按钮展开 7 天柱状图。
- **今日习惯**：默认显示未完成项，已完成项折叠为 "{N} 项已打卡" 一行。

## 7. 数据模型扩展（基于 OSS 融合）

### 7.1 HabitItem 增加 frequency 与 color

```ts
export type HabitFrequency =
  | { type: "daily" }
  | { type: "weekly-count"; target: number }   // 每周 N 次
  | { type: "interval-days"; interval: number }; // 每 N 天 1 次

export interface HabitItem {
  id: string;
  title: string;
  createdAt: string;
  checkedDates: string[];
  frequency: HabitFrequency;   // 新增，迁移时默认 { type: "daily" }
  color?: string;              // 新增，迁移时默认 undefined（使用 accent）
  reminderTime?: string;      // 新增，"HH:MM"，可选
}
```

### 7.2 FocusConfig 增加 rounds

```ts
export interface FocusRounds {
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  longBreakEvery: number;  // 每 N 个短休息后一次长休息
}

export interface AppState {
  // ... 现有字段
  focusRounds: FocusRounds;  // 新增，默认 25/5/15/4
}
```

### 7.3 日记页（DailyJournal）

```ts
export interface JournalEntry {
  date: string;        // "YYYY-MM-DD"，主键
  body: string;        // markdown 文本
  updatedAt: string;
}

export interface AppState {
  // ... 现有字段
  journals: JournalEntry[];  // 新增
}
```

日记在 Today 视图底部展示当日条目；用户可点击编辑。`[[任务标题]]` 解析为跳转链接。

### 7.4 持久化版本升至 v3

- v2 → v3 迁移：为所有 `HabitItem` 补 `frequency: { type: "daily" }`。
- 新增 `focusRounds` 默认值。
- 新增 `journals: []`。
- 保留 v1 → v2 已有迁移。

## 8. LearningProvider（保持原 spec）

不变。Web provider 用官方 B 站嵌入；原生 provider 通过宿主桥。

## 9. 响应式策略（保持原 spec）

- 手机 <768px：底部 5 标签，单列，安全区内边距。
- 平板 768–1199px：窄侧栏或轨道，双栏。
- 桌面 ≥1200px：240–272px 侧栏，最大内容宽度 1440px。
- 触控目标 ≥44px。

## 10. 错误与降级（保持原 spec）

加载、空、错误、部分数据四态。原生桥超时回退 Web。

## 11. 测试与验收

### 11.1 自动化

- 单元测试：v3 迁移、习惯频率判定、专注回合状态机、日记 wiki 链接解析、Today 主行动选择。
- 组件测试：Shell 五目的地、皮肤切换、Today 展开/折叠、Plan/Library 分段。
- Playwright 视口矩阵：1440×900、1024×1366、390×844、360×800。
- 每视口断言 `scrollWidth ≤ innerWidth`、最后一项不被 tabbar 遮挡。

### 11.2 体验验收

- 手机首屏无需滚动即可看到下一步、三项指标、首个今日事项。
- 桌面首屏同时展示主行动、今日安排、继续学习。
- 切换皮肤时颜色、表面、阴影、背景同时变化。
- 任意皮肤下正文对比度 ≥ 4.5:1（WCAG AA）。
- 无 FocuBili 桥时仍可添加课程、播放、记录进度、时间点笔记。

## 12. 实施顺序（修订）

按依赖与可见进度排序：

1. **皮肤 CSS 重写**（修复脱钩，让 11 套皮肤真的能用）。Commit: `feat: rewrite skin CSS to match v2 catalog`。
2. **塑料感修复**（三层材质、阴影纪律、圆角令牌、动效纪律）。Commit: `refactor: enforce 3-tier material system and shadow discipline`。
3. **Shell 五目的地导航 + 响应式修复**（替换 MAIN_NAV/TAB_NAV、安全区、固定栏不遮挡正文）。Commit: `feat: unify shell to 5-destination navigation`。
4. **Today 重构**（主行动 + 状态带 + 情境双栏）。Commit: `feat: redesign today as action dashboard`。
5. **Plan/Library 合并视图**（任务/习惯/考研/倒计时分段；继续学习/已保存/笔记/收集箱分段）。Commit: `feat: combine plan and library views`。
6. **OSS 能力融合**（习惯频率、专注回合循环、日记页 + markdown + wiki 链接）。Commit: `feat: adopt habit frequency, focus rounds, daily journal`。
7. **数据迁移 v2 → v3**（habit frequency、focusRounds、journals 默认值）。Commit: `feat: migrate state to v3`。
8. **LearningProvider + Web 降级**。Commit: `feat: add provider-based learning playback`。
9. **专注↔课程关联 + 时间点笔记**。Commit: `feat: link focus sessions to learning resources`。
10. **FocuBili 宿主桥**（在 `../focubili-src` 实现，GPL 边界）。Commit in FocuBili。
11. **设置/备份/许可证**（v3 备份格式、GPL 声明、密度切换、命令面板新动作）。Commit: `feat: finish backup and license settings`。
12. **跨端验收**（Playwright 视口矩阵、PWA/Android/Windows 截图）。Commit: `test: cross-viewport acceptance`。

## 13. 非目标

- 不引入云账号、云同步、自建服务端、社交、排行榜、无限推荐流。
- 不照搬 macOS/iOS 视觉，不使用苹果商标或受保护资源。
- 不引入 CodeMirror、ProseMirror、Quill 等重型富文本编辑器。
- 不为习惯实现原生通知（留给宿主桥或后续单独议题）。
- 不在本轮引入 Electron 打包（Windows 通过 PWA 或 FocuBili WebView2）。
