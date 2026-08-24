# Task Plan: FocuBili → RIXIA 完美融合

## Goal
把 FocuBili (Flutter, 144 dart files) 完整复刻进 RIXIA (React/Vite/Capacitor),做到功能与视觉"一点不差"。

## Context
- FocuBili 源码: `d:\一些有用的项目\FocuBili-master`
- RIXIA 移植: `src/features/bilibili/` + `src/lib/bilibili/`
- 根因: 历史提交是 10-40% 骨架移植,UI 细节丢失 → "复刻不出效果"

## Phase 状态 (2026-08-20)

### ✅ Phase 1: 现状审计与差距矩阵 (完成)
- 行数对比矩阵见 findings.md。FocuBili features 层 ~31k 行 dart vs RIXIA 原 ~6.9k 行 tsx

### ✅ Phase 2: M3 设计地基 + 核心页面重建 (完成, 全部通过 tsc + vitest 280 测试)
- [x] focubili-m3.css: #1677FF seed light/dark 全 token、M3 组件库、Material Symbols 字体
- [x] m3.tsx: Mi 图标 / M3Dialog / M3FeedbackProvider(Snackbar)
- [x] useFocusTimer → 模块单例(对齐 FocusTimerScope), 修复多实例不同步
- [x] focusStatisticsModel.ts: FocusStatisticsCalculator 1:1
- [x] FocusDashboard: hero+吸附滚动+全部卡片+工作台双栏
- [x] FocusDialogs: 礼花 Canvas / 打断两步流程 / 终止 / 自定义时长
- [x] FocusStatisticsView: 四指标+Canvas 折线+记录管理
- [x] LearningListView: 拖拽排序+状态菜单
- [x] ProfileHub: 账号状态机+7 入口+平板双栏
- [x] BilibiliSearchView: 2080 行完整移植
- [x] VideoNotesView: 封面卡片+选择模式+导出/分享
- [x] PersonalizationSettingsView: 新增(播放与专注/应用与存储)
- [x] Shell 双模式 + M3 配色
- [x] 验证: npx tsc --noEmit 0 错误; npx vitest run 280 全过; 浏览器首页 M3 呈现

### ⏳ Phase 3: 剩余页面群 (进行中)
- [x] **播放器沉浸式改造**（2026-08-20）：fb-player-page 全出血布局、覆盖式控制层（4s 自动隐藏 + 点击切换 + 迷你进度条）、顶部状态栏（专注目标/倒计时/时钟）、详情区（UP主/统计/可展开简介/选集/笔记）、弹幕设置与字幕浮层面板 — tsc 0 错误 / 284 测试全过
- [x] **播放器手势**（2026-08-20）：长按 3 倍速 + "三倍速中>>" 提示胶囊、水平拖拽 scrub 显示预览帧（松开提交/清除）— 新增 4 个手势单元测试
- [x] **UP 主页深度**（2026-08-20）：粉丝/关注/获赞/投稿统计行、FocuBili 式视频卡片（时长角标/分P角标/已观看角标/发布日期/播放+弹幕数）
- [x] **系统页**（2026-08-20）：诊断页新增播放偏好（默认清晰度/倍速/续播/双击快进）与缓存统计，对齐 FocuBili 诊断报告
- [x] 账号页群实现与错误状态（登录 / 收藏夹 / 关注 / 订阅 / 本机观看记录）已完成；真实账号数据仍待一次扫码验收
- [x] VideoNoteComposer / 详情页 M3 化（2026-08-20 按钮换 m3-*）
- [ ] 每页浏览器回归（已测：首页 / 搜索页 / 我的；待测：播放器沉浸交互、UP 主页、笔记、诊断）

### Phase 4：成熟项目收尾（2026-08-23）

- [x] 架构收口：FocuBili 功能已直接融入当前 React/TypeScript/Capacitor 工程，删除旧外部宿主/学习 provider/iframe 依赖。
- [x] 公开内容与播放器真实回归：搜索、结果进入播放器、MSE 播放、控制层、快进和远跳恢复已验证。
- [x] 数据完整性：补齐 v3 备份导入的考研错题、复习队列、模考和初试日期迁移，并加入回归测试。
- [x] 性能收口：详情与标签请求并行，避免打开视频时无必要的串行网络等待。
- [x] 工程门禁：410 个测试、TypeScript、生产构建、跨视口检查、Android debug APK 构建均通过。
- [x] 收尾交互：缓存清理与备份导入改为项目内 M3 确认框，移除阻塞式浏览器确认框。
- [x] 路由收口：命令面板不再暴露已删除的服务端观看历史和首次启动空路由，旧持久化值仍由迁移层重定向。
- [x] 原生账号边界：账号 API、弹幕、默认 playurl 统一使用项目内 HTTP 适配器，避免 Android WebView fetch/CORS 与 localhost 代理误路由。
- [ ] 一次扫码后的账号实测：二维码已重新生成并处于等待扫描，待确认用户资料、收藏夹、关注、订阅和登录持久化。
- [ ] 账号实测完成后，复核最终差异并发布收尾报告。

## Decisions
- 以 FocuBili-master 为唯一基准源
- 视觉对齐以 FocuBili 源码样式常量为准
- 新视图需加入 ViewKey + App.tsx + Shell FOCUBILI_VIEWS + catalog VIEW_TITLES 四处接线

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| JSX 标签交叉闭合 | 1 | 修复 App.tsx 闭合顺序 |
| Mi 组件缺 style prop | 1 | 增加 CSSProperties 支持 |
| JS 输入被 harness 截断 | 多次 | 改用短 Edit / python 修补 |
| ProfileHub 同步渲染 | 1 | useState 用 currentState() 初始化 |
| 工作台重复渲染继续卡 | 1 | 拆分 coreCards 与 continueCard |

### Phase 3 更新（2026-08-20 继续）
- [x] **账号页群重写**（2026-08-20）：BilibiliFavoritesView / FavoriteVideosView（新增独立视图）/ BilibiliFollowedView /
      BilibiliSubscribedCollectionsView 四个组件逐行对照 Dart 源码重写，八态状态机 + 本地搜索 + 加载更多 + 角标细节还原
- [x] **根因修正**：移除虚构的服务器端观看历史（`x/v2/history`，FocuBili 源码不存在），"我的"页"观看记录"改指向已忠实
      移植的本机 `LocalWatchHistoryView`
- [x] LoginView 深挖：扫码登录、Cookie 登录、切换账号自动进入官方登录、过期态和网络中断可恢复轮询均已覆盖
- [ ] 每页浏览器回归（本会话沙箱环境 Playwright 守护进程受限，无法启动，待后续环境允许时补做）

### Phase 3 更新（2026-08-20 继续 3）
- [x] **LoginView 深挖 + 切换账号根因修复**（2026-08-20）：接入此前已移植但从未使用的 `createBilibiliQrLoginService`
      扫码登录状态机；修复 `ProfileHub.openLogin` 丢弃 `openOfficialLoginOnStart` 参数的问题（新增 store
      `loginAutoOfficial` 状态）；新增 7 个测试覆盖扫码/Cookie/切换账号自动跳转流程
- [ ] 每页浏览器视觉回归（沙箱环境 Playwright 守护进程受限）
- [ ] 播放器手势细节、系统页群更多分支的进一步深挖

### Phase 3 更新（2026-08-20 继续 4）
- [x] **应用更新架构统一**（2026-08-20）：新增 `AppUpdateContext.tsx`（`AppUpdateProvider`/`useAppUpdateController`，
      对齐 Dart `AppUpdateController`/`AppUpdateScope`），消灭三处互相独立、行为不一致的更新检查实现；删除多余的
      `app-update` 独立路由（FocuBili 源码里更新卡片只存在于"关于"页内）；`AboutView.tsx` 补齐完整更新卡片 + 问题
      诊断入口；`ProfileHub` 设置入口补齐红点；修复 `PersonalizationSettingsView` 更新开关使用错误 storage key
      导致与实际检查逻辑完全脱节的 bug
- [ ] 每页浏览器视觉回归（沙箱环境 Playwright 守护进程受限）
- [ ] 播放器手势细节、系统页群更多分支的进一步深挖（评估后确认功能覆盖已相当完整，行数比例矩阵不完全反映真实差距）

### Phase 3 更新（2026-08-20 继续 5）
- [x] **播放器笔记工作区重建**（2026-08-20）：接入此前从未使用的 `VideoNoteComposer.tsx`，替换掉极简陋的
      内嵌表单；新增新建/选中编辑/自动保存去抖/删除二次确认/跳转到时间点完整交互，对齐 Dart
      `_PlayerNotesWorkspace` mixin
- [ ] 每页浏览器视觉回归（沙箱环境 Playwright 守护进程受限）

### Phase 3 更新（2026-08-21 新会话）
- [x] **VideoNotesView 响应式双列**（2026-08-21）：对齐 Dart `AdaptiveTwoColumnList`（breakpoint=760），≥760px 自动两列，max-width 1180px
- [x] **VideoNoteDetailDialog 宽屏双栏工作台**（2026-08-21）：对齐 `video_note_detail_page.dart` 的 `_buildResponsiveBody`，≥900px 左参考区 + 右编辑区两栏独立滚动
- [x] **VideoNoteFrameViewer 重置缩放按钮**（2026-08-21）：对齐 Dart `_resetZoom()`，左上角新增"重置缩放"按钮一键回到 1x
- [x] **HomeFeedView 从旧 RIXIA 骨架升级到 M3 全出血首页**（2026-08-21）：`fb fb-page` 外壳 + `fb-appbar` 顶栏 + M3 卡片/chip + 主动搜索入口 + 清空历史接线 + 四态分离
- [ ] 每页浏览器视觉回归（沙箱环境 Playwright 守护进程受限）

### Phase 3 更新（2026-08-22 会话）
- [x] **"两个视频控制"根因确认 + 修复**：旧 dist（12:23 构建）仍含 `player.bilibili.com/player.html` 官方 iframe —— iframe 自带 B 站控制条 + RIXIA 自绘 `player-controls` = 两套控制。工作区已改为 MSE DASH 单控制（`DashPlayer` + `.fb-player-controls-overlay`），本次 `npm run build` 让 preview 与源码一致
- [x] **播放器沉浸式移动端**：Shell 增加 `data-view`，播放页隐藏底部导航（对齐 FocuBili 全屏工作台）
- [x] **MSE 播放器测试对齐**：BilibiliPlayerView.test.tsx 4 个测试仍 mock 已删除的 iframe 桥，改为 mock `DashPlayer`/`playurlService`，断言改为「分P chip active / dashSetVolume」，并修复播放器双续播提示互相覆盖的问题（`resumeNoticeShownRef`）→ 364 测试全绿
- [x] **搜索/扫码登录根因确认**：dev 代理下 `wbi/search/type`、`suggest`、passport 扫码 generate/poll 全部 HTTP 200 返回正常数据 → 前端搜索/扫码在当前工作区已正常，此前用户看到的问题来自旧 preview 构建
- [x] **考研词汇本（单词）**：新增 `KaoyanWord` + `reviewItems.sourceType:"word"`、`DEFAULT_KAOYAN_WORDS`（60 高频词）、store `addWord`/`removeWord`、migration v3 兼容、KaoyanView「单词」Tab（今日背词/加词/导入内置词表/词表管理）+ 3 个单元测试
- [ ] 每页浏览器视觉回归（沙箱环境 Playwright 守护进程受限）
