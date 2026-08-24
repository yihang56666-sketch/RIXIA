# Progress Log

## Session 2026-08-24（全功能 Bug 排查与修复：平板 + 桌面）

四路并行深审（Shell/CSS、Bilibili、Store、生产力功能）后确认并修复约 40 个真实缺陷。基线 87 文件/462 测试 → 终态 **88 文件/479 测试全绿**，tsc 0 错误，生产构建成功，跨视口完整性检查 15/15 通过。

### 数据丢失类（最高优先级）
1. **播放进度永不落盘**：保存 effect 以 `currentTime`（~4次/秒）为依赖反复重建 setTimeout，连续播放期间定时器永不到期，且卸载只 clearTimeout 不 flush——不暂停就永远不保存进度/观看历史。改为"单待写定时器 + 卸载/分P切换/pagehide 立即 flush"。
2. **localStorage 配额超限炸掉全部 action**：zustand persist 用裸 setItem，QuotaExceededError 会从每个 store action 同步抛出且无错误边界 → 整树卸载。改为 try/catch 安全存储适配器。
3. **多标签页整份快照互相覆盖**：无任何跨页同步，双标签并发操作必丢一侧数据。补 `storage` 事件触发 `persist.rehydrate()`。
4. **备份丢 focusMinutes/backgroundImage**：导出/导入/校验三处补齐。

### 播放器
5. 手势层鼠标拖出覆盖层松手后永久锁死（无指针捕获 + window 级 up/cancel 兜底 + 残留状态重置）。
6. DashPlayer.destroy() 泄漏 video 全部监听器（复用元素上越积越多）→ 存字段并在 destroy 移除。
7. 弹幕三设置无效化：opacity/strokeWidth 从未应用（硬编码）、scrollDurationSeconds 调度与绘制速度不一致导致同轨重叠、mergeRepeated 未接线 → 全部生效。
8. 弹幕画布只在挂载时定尺寸：全屏/旋转/DPR 变化后模糊错位 → ResizeObserver + devicePixelRatio 变换；RAF 循环去掉 currentTime 依赖（每秒 4 次 teardown 重建）。
9. 卸载时未清空专注控制器播放联动（继续专注误恢复）；saveNote/deleteNote 无 try/finally 卡死"保存中"；定时关闭倒计时显示空白；清晰度偏好≠默认值时整条流加载两次；笔记封面后台补齐覆盖用户新编辑；HomeFeed 标题 dangerouslySetInnerHTML 注入风险。

### Shell / 平板+桌面响应式
10. 视频卡删除按钮 hover 才显形：触屏不可见但可误触删除 → `(hover:hover) and (pointer:fine)` 门控。
11. 捕获 FAB 断点 768 与侧栏断点 700 不匹配（701–767px 双入口悬浮遮挡内容）→ 对齐 700px。
12. 新增全局浮层栈 `overlayStack.ts`：Escape 只派发栈顶浮层（此前弹窗+命令面板一次按键全关、丢失编辑草稿）、Ctrl+K 不再穿透到弹窗下层、任意浮层打开时锁定背景滚动（含滚动条宽度补偿防跳动）。
13. 命令面板焦点移出输入框后方向键/回车失灵 → 键盘处理上移浮层层级；高亮项 scrollIntoView。
14. 通用 Modal 无 max-height：内容超高后标题/按钮物理不可达 → overlay 可滚 + card 上限。
15. 捕获弹层点外部无法关闭 → 透明 backdrop + 提交后自动收起。
16. 触屏专项：输入框统一 16px 防 iPadOS 聚焦缩放、进度条触控区 26px+20px 拇指、icon-button 40px、chip-remove 扩大命中区、snackbar 抬到底部导航上方、底部导航高度计入 safe-area、dvh 全部补 vh 回退。

### 生产力功能
17. **番茄计时器离开页面即销毁**：状态全在组件内，切视图=清零重置。重构为锚点时间戳真源（endsAt/countupStart）+ 镜像进持久化 activeFocus —— 切视图/重启都能精确恢复，顺带根治后台节流计时漂移；activeFocus 管线从死代码变为可用（Today"继续专注"入口激活）。
18. Wake Lock 三处竞态泄漏 sentinel + 隐藏自动释放后永不恢复 → cancelled 守卫 + visibilitychange 重申请。
19. "跳过休息"后 400ms 孤儿定时器自启下一回合 → 计时清理。
20. 运行中改时长静默杀掉当前回合 → 控件禁用 + 效果守卫；回合循环 ±5 绕过 UI 夹取改走 adjust()。
21. 考研连续学习 UTC/本地日期混用（UTC+8 永远少算一天）→ 本地键归一；任务完成图同理（stats.ts slice(0,10) → todayKey 归日本地化）。
22. 习惯频率类型（每周 N 次/间隔天数）从未参与任何打卡数学：今日列表按每日催办、强度按 30 天日历算成"看起来失败"。新增 `habitSchedule.ts`（频率感知 due-today/streak/strength），HabitsView/TodayView 接线，14 个新测试。
23. 任务/笔记编辑弹窗取消后草稿残留、再次 Enter 把废弃文本存进去 → 打开即重置、关闭即丢弃。
24. 屏蔽词受控值吞逗号（两处：设置页+播放器弹窗）→ 原始草稿 state。
25. removeSubject 级联漏掉 wrongQuestions/reviewItems 的悬挂 subjectId → 置空；收集箱转任务先移除防双击重复建任务；正计时"完成并记录"双击防抖；noise stop 单节点独立 try 保证 AudioContext 必被 close；日记页日期切换/晚到水合重同步内容。

### 验证
- `npx tsc --noEmit`：0 错误
- `npx vitest run`：88 文件 / 479 测试全部通过
- `npm run build`：成功
- `node scripts/verify-cross-viewport.mjs`：15/15
- Playwright 真实浏览器回归：桌面 1440×900 / 平板竖屏 834×1112 / 窄屏 660×900 三视口无横向溢出、导航形态正确、命令面板开合正常、弹窗叠加 Escape 只关一层、取消不落草稿、FAB 断点正确；iPad 设备模拟下删除按钮常显、输入框 16px、无溢出。

## Session 2026-08-23（收尾基线与真实回归）

- 已确认 FocuBili 能力是 React/TypeScript/Capacitor 项目内的直接重写；没有外部 FocuBili 宿主、Flutter 运行时或 WebView 消息桥。
- 修复 v3 备份导入丢失 `wrongQuestions`、`reviewItems`、`mockExams`、`kaoyanExamDate` 的数据迁移缺口，并新增回归测试。
- `lookupVideo()` 的详情与可选标签请求改为并行，减少打开视频时的串行等待；标签失败仍可正常播放。
- 浏览器实测：公开搜索、短视频 MSE 播放、连续快进、单一控制层均正常；视频元素 `readyState=4` 且无媒体错误。
- 独立 Chromium 真实回归：搜索“考研数学基础”返回结果，打开视频后鼠标拖动进度条从约 80% 跳到约 92%（远距离未缓冲区）成功，视频继续播放且无控制台错误；分 P、时间点笔记、未登录账号页和设置页均可进入。
- Android debug APK 已重新构建成功：`android/app/build/outputs/apk/debug/app-debug.apk`；当前没有连接 Android 真机/模拟器。
- 最新验证：81 个测试文件 / 410 个测试通过，类型检查、生产构建、跨视口完整性检查均通过；使用官方 npm registry 执行生产依赖审计，结果为 0 vulnerabilities。
- 本轮补齐跨平台账号边界：原生账号 API、弹幕请求和默认 playurl 请求统一走项目内 HTTP 适配器；原生环境不再误用 Vite localhost 代理，并转发本地 Cookie；账号网络/过期错误不再被吞成“账号信息缺失”。
- 待完成：用户一次扫码后验证当前用户资料、收藏夹、关注、订阅、登录持久化和过期态；二维码已重新生成并处于“等待扫描”，尚未收到扫码事件。
- 登录错误处理补强：二维码轮询的临时网络中断会继续保留会话并自动重试；二维码首次生成失败统一显示友好提示，不再把 `fetch failed` 直接显示给用户。
- 本轮收尾：缓存清理与备份导入均改为非阻塞 M3 确认框，避免 WebView/自动化被原生 `confirm()` 卡住；缓存清理成功提示不再被刷新逻辑覆盖。
- 本轮路由收口：命令面板移除已删除的服务端观看历史与首次启动空路由，并新增 2 个回归测试。

## Session 2026-08-22（续会话：进度条拖动卡死根治 + BEID 图标/改名收尾 + 专注目标卡）

### 修复 5：拖动进度条卡死（三重根因，全部修复并在真实环境验证）

1. **seek 风暴**：进度条 `onChange` 每个拖动 tick 都直接调 `seek()`，一次拖动触发几十次
   seek。已改为拖动期间只更新 `scrubTime` 预览值，`onPointerUp/onTouchEnd/onPointerCancel`
   才提交一次（键盘方向键仍即时提交，无障碍不受影响）。手势横向拖动（gestureCoordinator）
   同样改为"预览帧 + 松手提交"，并修复两个连锁问题：锚点时间在滑动开始时捕获（不再随播放
   推进漂移/复利累加）；协调器只创建一次（回调经 ref 透传），不再因 `currentTime` 变化在
   拖拽中途被销毁重建。
2. **跳不到未缓冲区域（核心根因）**：DashPlayer 原来只能从文件头顺序下载，拖到远处时那里
   永远没有数据 → 视频死等。重写为 sidx 分段索引定位：新增 `mp4Boxes.ts`（sidx 解析
   [B 站 m4s 为 version 1]、moof 边界扫描含跨块头部兜底、时间→字节映射）；首次拉流时捕获
   init 段 + 解析索引；`seek()` 检测目标不在两轨 buffered 交集时走 `restartAt()`：掐断在途
   下载（AbortController + generation 代际取消）→ 清空 SourceBuffer → 重新追加完整 init 段 →
   从 sidx 映射的字节偏移重启拉流（无索引时按码率线性估算兜底）→ moof 对齐后才追加 →
   播放头钳制到新缓冲区间。sidx 缺失/CDN 502 等场景均有回退。
3. **初载 init 段被漏加**：moof 扫描命中在首块内时，moof 之前的 ftyp+moov+sidx 字节没有进
   SourceBuffer → `CHUNK_DEMUXER_ERROR_APPEND_FAILED`（浏览器实测抓到，jsdom 桩无法发现）。
   已修复：init 段字节同样按顺序进入追加队列。

- 测试：`mp4Boxes.test.ts` 11 个（合成 sidx/跨块头/非法 size 伪命中）、`dashPlayer.test.ts`
  重写为时间感知桩（init 段不建时间轴、hint 带 initBytes 防交错吃错）覆盖"已缓冲快速路径"与
  "sidx 映射字节偏移重启"，`gestureCoordinator.test.ts` 新增锚定测试，
  `BilibiliPlayerView.test.tsx` 新增"拖动中不 seek、松手只提交一次"测试。
- **浏览器真实环境验证（Playwright MCP）**：搜索"考研数学基础"真实返回 20 条 → 打开武忠祥
  34 分钟课程 → MSE 播放正常（readyState 4）→ 拖动到 **1500 秒（25 分钟，远超缓冲）**：
  两轨 Range 请求精确命中 sidx 映射偏移（13.68MB/12.28MB），缓冲精确重建为 [1500,1600]，
  视频在 1505.8 秒继续播放，画面（高数公式）正常，无错误。刷新后的自动续播（seek 80s）同样
  走重启路径成功。

### BEID 改名与图标收尾
- `package.json` name → `beid`；manifest 图标 → `/beid-icon.png`+`/beid-icon.svg`；删除
  `public/focubili-icon.png`；Shell 侧栏与关于页图标引用更新。
- 新图标（专注目标环 + 播放三角，#2B7BFF→#0A47C2 渐变）：Playwright 渲染 SVG 生成全套 17 个
  PNG（PWA 512、favicon、Android 5 密度 × launcher/round/foreground），自适应背景色改
  #1557D8。浏览器实测侧栏图标与首页品牌正常。
- 浏览器验证：首次启动协议门显示 BEID；首页 hero"今天要学点什么？+ 开始搜索"；扫码登录页
  二维码本地渲染（392×392 data URL，无外部服务依赖）。

### 考研专注功能：每日专注目标卡
- KaoyanView 倒计时 hero 下新增"每日专注目标"卡：接 FocuBili 专注台真实计时
  （`buildFocusStatisticsSnapshot` 30 天窗口），展示今日已专注/目标分钟数+进度条、近 7 天
  柱状图（达标日绿色）、连续专注天数与 7 天日均；目标可 ±30 调整（本机持久化
  `beid.kaoyan.focus-goal-v1`，默认 240），"去专注"直达专注台。+1 测试（默认值/调整/跳转）。

### 验证结果（最终）
- `npx tsc --noEmit`：0 错误
- `npx vitest run`：407 测试，406 通过；1 个既有计时测试在满载并发下偶发超时
  （`BilibiliPlayerView` 顶栏专注剩余时长测试，单独运行 26/26 稳定通过，与本次改动无关，
  属 progress.md 早前已记录的历史脆弱性）
- `npm run build`：成功

## Session 2026-08-21（新会话：响应式双列笔记列表 + 宽屏双栏笔记详情工作台）

### 起点（基线已确认绿色）
- `npx tsc --noEmit`：0 错误
- `npx vitest run`：75 文件 / 343 测试全部通过
- `npm run build`：生产构建成功
- 当前 RIXIA bilibili UI 层 ~10,661 行 tsx vs FocuBili features ~31,272 行 dart（非测试）。
  覆盖率已达 ~34%，但 findings.md 已论证行数比例不能直接等同于功能/视觉缺失；需逐项核对可见差距。

### 本会话识别的可见差距（按视觉影响排序）
1. **VideoNotesView 单列 vs Dart 双列**：FocuBili 用 `AdaptiveTwoColumnList`（breakpoint=760）在宽窗口自动排成两列；RIXIA 是 `max-width: 840px` 的单列网格，桌面/平板宽屏会浪费横向空间，视觉与原版明显不符。
2. **VideoNoteDetailDialog 窄弹窗 vs Dart 全页双栏工作台**：FocuBili 详情页在 ≥900px 时左参考区（来源卡+元数据+截图）+ 右编辑区（标题+正文）两栏独立滚动；RIXIA 是窄 modal 单列堆叠，桌面阅读笔记时编辑区行宽过窄。
3. **FrameViewer 缺重置缩放按钮**：Dart `_resetZoom()` 有显式复位按钮；RIXIA 只能靠双击在 1x/2.5x 间切换，无法一键回到 1x。

### 本会话已完成
1. **VideoNotesView 双列响应式**（[VideoNotesView.tsx:281](src/features/bilibili/VideoNotesView.tsx#L281)）：把列表容器从内联 `max-width: 840px` 单列换成 `.video-notes-grid` 类。新增 CSS（[global.css:3559-3571](src/styles/global.css#L3559-L3571)）：默认单列 `max-width: 840px`；`@media (min-width: 760px)` 切到 `grid-template-columns: 1fr 1fr` 且 `max-width: 1180px`，对齐 Dart `AdaptiveTwoColumnList.breakpoint = 760`。
2. **VideoNoteDetailDialog 宽屏双栏工作台**（[VideoNoteDetailDialog.tsx:121-176](src/features/bilibili/VideoNoteDetailDialog.tsx#L121-L176)）：把扁平结构重排为 `header / reference-pane / editor-pane` 三个语义区块。窄窗口仍是单列堆叠；新增 CSS（[global.css:3573-3600](src/styles/global.css#L3573-L3600)）：`@media (min-width: 900px)` 时 dialog 变为两栏 grid（`grid-template-areas: "header header" "reference editor"`，2fr/3fr 比例对齐 Dart `_buildWideReferencePane` flex 4 + `_buildWideEditorPane` flex 6），左参考区带半透明背景 + 右分隔线 + 独立滚动，右编辑区独立滚动。与 Dart `_buildResponsiveBody` 的 900px 断点完全一致。
3. **FrameViewer 重置缩放按钮**（[VideoNoteDetailDialog.tsx:26-52](src/features/bilibili/VideoNoteDetailDialog.tsx#L26-L52)）：新增左上角"重置缩放"按钮（Maximize2 图标），点击调用 `setScale(1)` 复位；`stopPropagation` 避免冒泡到外层关闭。对齐 Dart `VideoNoteFrameViewerPage._resetZoom()`。
4. **测试**：`VideoNoteDetailDialog.test.tsx` 新增 1 个测试验证双击放大后点击"重置缩放"能回到 `scale(1)`。

### 验证结果（本轮）
- `npx tsc --noEmit`：0 错误
- `npx vitest run`：75 文件 / 344 测试全部通过（比基线多 1 个新测试）
- `npm run build`：生产构建成功

### 补充（同会话续做：HomeFeedView 从旧 RIXIA 卡片骨架升级到 M3 全出血首页）
- 逐项对照 FocuBili `home_page.dart` 与 `focus_dashboard.dart` 的首页结构：FocuBili 首页只有"搜索按钮 + 右上角个人图标 + 上滑吸附展开卡片"，没有推荐流；RIXIA 的 HomeFeedView 此前是旧 RIXIA `.card / .chip / .stack` 卡片骨架，与 FocuBili M3 视觉完全脱节（`.stack` 不在 fb-page 全出血外壳里，没有 fb-appbar 顶栏）。
- 已重写为：
  - `fb fb-page` 全出血外壳 + `fb-appbar` 顶栏（返回 + 标题 + 刷新 + 主动搜索入口）
  - 热门关键词 M3 卡片（`m3-card` + `m3-list-tile` + `m3-chip selected` 选中态）
  - 最近搜索卡片（`Mi history` 图标 + 清空历史按钮 + 关键词 chips）
  - 结果列表区域（带加载/错误/空/正常四态，全部用 M3 风格）
  - 复用 `openBilibiliVideo` 既有 action 跳转播放器
- `activeKeyword` 状态在加载/完成/失败时都正确显示在顶部结果计数上
- 清空历史调用 `historyService.clear()`（此前未接线的方法）
- 保留所有原有功能（`openBilibiliVideo(r.bvid, r.title)` 断言、默认关键词 chips、搜索历史记录）
- 测试：新增 1 个测试验证 M3 appbar（返回首页 + 主动搜索按钮可访问），mock `clear` 方法
- 清理无用 import（`Loader2`、`TrendingUp` 未再使用，已删除）

### 验证结果（本轮最终）
- `npx tsc --noEmit`：0 错误
- `npx vitest run`：75 文件 / 345 测试全部通过（比基线多 2 个新测试）
- `npm run build`：生产构建成功

## Session 2026-08-20 (FocuBili 完美复刻) — 继续

### 本会话新增（播放器沉浸式改造 + M3 收尾）
1. **BilibiliPlayerView 沉浸式重写**（最大块 Phase 3 主体）：
   - 页面结构改为 fb-player-page 全出血 flex 列（视频区 + 下方滚动详情区）
   - 视频 surface 居中、16:9、62vh 封顶，黑底
   - 顶部状态栏覆盖层：返回按钮 + 标题 + 专注目标/倒计时 + 时钟 + 专注控制 + 字幕 + 弹幕设置
   - 底部控制层覆盖视频：进度条 + 播放/±10s/时间/音量/倍速/清晰度/循环/定时关闭/全屏/画中画
   - 播放时 4s 自动隐藏控制层，点击切换显示，隐藏时显示 2px 迷你进度条
   - 弹幕设置 / 字幕轨道改为右上角浮层面板（dark popup）
   - 详情区：大标题 + UP 主/播放/弹幕/BV meta 行 + 操作按钮（专注观看/加入学习清单/分享/在B站打开/合集）+ 章节条 + 可展开简介 + 四格点赞/投币/收藏/分享统计 + 标签 + 选集 chips + 时间点笔记工作区
   - 加载/错误态改为沉浸式黑底状态
   - 保留全部既有功能（弹幕 canvas、字幕、章节、互动剧情、学习清单、专注联动、native 播放器、倍速/定时、笔记截图/导出）
2. **M3 按钮收尾**：VideoNoteComposer（保存/跳转）、VideoNoteDetailDialog（分享/保存）、BilibiliAccountViews（生成登录二维码）、PlaybackCompletionOverlay（标记已完成/继续学习）、InteractiveVideoChoiceOverlay（重试）、FocusSharePreview（分享）全部换用 m3-* 按钮类
3. **CSS**：新增 .fb-player-* 沉浸式播放器全套样式 + .fb-player-popup 浮层 + m3 按钮 compact 变体

### 验证结果
- `npx tsc --noEmit`: 0 错误
- `npx vitest run`: 67 文件 / 280 测试全部通过
- 浏览器实测: 首页呈现 FocuBili M3 风格（hero+开始搜索胶囊按钮+个人入口）

### 待办(后续会话)
- [ ] 账号页群 / UP 主页 / 收藏夹详情深挖（对比 FocuBili 1505 行 user_profile_page.dart 仍偏薄）
- [ ] 系统页群(缓存/诊断/权限) 与 FocuBili 对齐更多细节
- [ ] 每页浏览器回归（尤其播放器沉浸式交互、控制层自动隐藏）
- [ ] 播放器左滑/右滑手势、长按 3 倍速、双击分区 seek 的精确对齐

## 补充 (同会话续做)
- LoginView.tsx: 重建为 FocuBili 结构(手机号/密码/Cookie 三段切换,官方页面处理账号密码)
- 账号数据视图(收藏夹/关注/订阅/观看历史)按钮切换为 M3,行使用 M3 token
- SystemPages(更新/缓存/诊断/权限)按钮 M3 化;播放器外围按钮 M3 化;播放器自定义控件保留原 FocuBili 风格
- 验证: tsc 0 错误 / 280 测试全过 / 浏览器首页正常

## Session 2026-08-20 (FocuBili 完美复刻) — 继续

### 根因确认
- 历史 40+ 个"1:1 port"提交实际是 10-40% 行数的骨架移植 → 视觉效果丢失是"复刻不出效果"根因
- 完整行数对比矩阵见 findings.md

### 本会话已完成(全部通过 tsc + vitest)
1. **M3 设计地基**: focubili-m3.css(#1677FF seed light/dark 全 token、类型标度、Card/按钮系/Chip/Segmented/TextField/进度/ListTile/Dialog/Snackbar/PopupMenu)+ Material Symbols Rounded 字体(index.html)+ Mi 图标组件 + M3Dialog/M3FeedbackProvider
2. **useFocusTimer → 模块单例控制器**: 修复多实例不同步;todayFocusedMs 走统计计算器
3. **focusStatisticsModel.ts**: FocusStatisticsCalculator 1:1 移植
4. **FocusDashboard**: 完整重建(首屏 hero+吸附滚动+全部卡片+工作台双栏)
5. **FocusDialogs**: 完成礼花 Canvas + 打断两步流程 + 终止/自定义时长弹窗
6. **FocusStatisticsView**: 范围选择+四指标+Canvas 折线趋势+记录管理(搜索/筛选/排序/删除/清空)
7. **LearningListView**: 拖拽排序+状态菜单+进度+已完成分区
8. **ProfileHub**: 账号状态机+7入口+平板双栏
9. **BilibiliSearchView**: 2080 行完整移植(双模式/候选高亮/历史/筛选面板/BV直达/分集补查/学习清单)
10. **VideoNotesView**: 封面卡片+时间角标+选择模式+导出/分享底部栏
11. **Shell/global.css**: 双模式(全出血自管滚动/流式)+M3 配色+紧凑导航
12. **测试**: 全部更新匹配忠实行为

### 验证结果
- `npx tsc --noEmit`: 0 错误
- `npx vitest run`: 67 文件 / 280 测试全部通过
- 浏览器实测: 首页呈现 FocuBili M3 风格(hero+开始搜索胶囊按钮+个人入口)

### 待办(后续会话)
- [ ] 播放器套件(16 文件 ~8600 行)M3 化 — 最大块
- [ ] 账号页群(登录 779/收藏夹/关注/订阅/UP 主页 1505/观看历史)M3 化
- [ ] 系统页群(关于/缓存/诊断/权限/个性化设置 743)
- [ ] VideoNoteComposer M3 化
- [ ] 每页浏览器回归

## 补充 (同会话续做)
- LoginView.tsx: 重建为 FocuBili 结构(手机号/密码/Cookie 三段切换,官方页面处理账号密码)
- 账号数据视图(收藏夹/关注/订阅/观看历史)按钮切换为 M3,行使用 M3 token
- SystemPages(更新/缓存/诊断/权限)按钮 M3 化
- 播放器外围按钮 M3 化;播放器自定义控件保留原 FocuBili 风格
- 验证: tsc 0 错误 / 280 测试全过 / 浏览器首页正常
## Session 2026-08-20 (FocuBili 完美复刻) — 继续 3

### 本会话新增（UP 主主页 + 本机观看记录深度还原）
1. **CreatorCollectionViews.tsx 重写**（对齐 user_profile_page.dart 1453 行 + collection_detail_page.dart 502 行）：
   - 可折叠资料头：宽屏横向 / 窄屏纵向自适应，头像 + 昵称 + UID + 认证徽标 + 可展开简介（超两行才显示"展开/收起"按钮）+ 粉丝/关注/获赞统计
   - 投稿工具栏：真实总数 + 排序菜单（最新发布/最多播放/最多收藏，点击展开浮层）+ 可展开搜索框（默认收起，点击图标展开）
   - 滚动到底自动翻页（`scrollHeight - scrollTop - clientHeight > 420` 阈值，对齐 FocuBili `extentAfter < 420`）
   - 分P数量补查队列：列表接口没给出集数时，对可见卡片安排详情补查，最多两个并发，避免整屏视频同时请求
   - 视频卡片：时长角标 + 分P数角标 + "上次看过 mm:ss" 本机观看角标 + 播放数/弹幕数 + 发布日期 + 独立"加入学习清单"按钮
   - 专栏 / 合集 Tab：专栏卡片保留摘要+阅读数；合集改为网格卡片（封面+视频数角标+标题渐变遮罩）
   - 修复：整行卡片原实现把"加入学习清单"按钮嵌套进外层 `<button>`，违反 HTML 规范导致 hydration 报错 → 外层改为 `role="button"` 的 `div`（含键盘 Enter/Space 支持）
2. **LocalWatchHistoryView.tsx 重写**（对齐 watch_history_page.dart 589 行，原实现仅 74 行/14%）：
   - 本机专属说明卡（"仅保存在本机，不与 B 站账号或云端观看历史同步"）
   - 加载 / 错误（含重试）/ 空 / 搜索无结果 / 列表五态清晰分离
   - 缺失缩略图批量补齐：每批最多两个并发 `lookupVideo` 请求，成功后调用 `watchHistoryService.backfillThumbnails` 持久化
   - 卡片点击先查询最新视频详情再跳转播放（避免使用可能已失效的旧分P数据），查询中显示遮罩 loading
   - 已观看时长角标（"已看 mm:ss"覆盖在缩略图右下角）
   - 删除单条记录 / 清空全部记录均改为二次确认对话框（M3Dialog），不再是浏览器原生 `confirm`
3. **watchHistoryService.ts 扩展**：新增 `backfillThumbnails(thumbnailUrls)` 方法（1:1 对应 Dart `WatchHistoryService.backfillThumbnails`：只填充空缩略图字段，保留原顺序/观看时间/进度，仅在有变化时才写入存储）；`clear()` 返回类型改为 `Promise<LocalWatchHistoryEntry[]>` 对齐 Dart 版本语义
4. **CSS**：新增 `.creator-profile-header` / `.creator-video-toolbar` / `.creator-order-menu` / `.creator-collection-grid` 等 UP 主主页全套样式；新增 `.watch-history-notice` / `.watch-history-state` / `.watch-history-thumbnail` / `.watch-history-position-badge` 等本机观看记录全套样式

### 验证结果
- `npx tsc --noEmit`：0 错误
- `npx vitest run`：68 个测试文件 / 286 个测试全部通过（新增 2 个删除/清空确认对话框测试）

### 待办（后续会话）
- [ ] VideoNoteDetailDialog 深挖对齐 video_note_detail_page.dart（785 行，当前仅 64 行/8%，缺少未保存修改拦截、全屏截图浏览等）
- [ ] 登录页 / 收藏夹 / 关注 / 订阅合集详情页深挖（对比 FocuBili login_page.dart 779 行等）
- [ ] 每页浏览器回归（尤其 UP 主主页折叠头交互、本机观看记录确认对话框）


### 补充（同会话续做 2 — VideoNoteDetailDialog 深挖）
1. **VideoNoteDetailDialog.tsx 重写**（对齐 video_note_detail_page.dart 785 行，原实现仅 64 行/8%，现 184 行）：
   - 视频来源卡：点击先查询最新分P信息再跳转播放（避免用过期数据），查询中显示 loading 图标
   - 时间点 / 记录日期 / 分P 三枚元数据标签（Chip 样式，图标+文字）
   - 未保存修改拦截：标题或正文有改动时点击关闭会先弹"有未保存的修改"确认对话框，选择"不保存并退出"才真正关闭；无改动则直接关闭
   - 删除笔记改为二次确认对话框（M3Dialog），不再是裸露的删除按钮
   - 视频截图从"内嵌小图"升级为"点击进入全屏浏览"：黑底全屏层 + 支持鼠标滚轮和双击缩放（1x~6x）
   - 新增独立测试文件 `VideoNoteDetailDialog.test.tsx`（5 个测试：来源视频跳转、未保存拦截、无修改直接关闭、删除二次确认、全屏截图浏览开关）
2. **VideoNotesView.test.tsx 同步更新**：mock `publicContentService.lookupVideo`；"从详情删除笔记"测试步骤改为先点删除再确认对话框中的"删除"按钮，对齐新的二次确认流程
3. **CSS**：重写 `.video-note-detail-*` 系列样式（来源卡封面缩略图、元数据 Chip、标题输入框、截图区）+ 新增 `.video-note-frame-viewer` 全屏浏览层样式；清理一处重复的旧 `.video-note-detail-frame` 定义

### 验证结果（本次全部通过）
- `npx tsc --noEmit`：0 错误
- `npx vitest run`：69 个测试文件 / 291 个测试全部通过

## Session 2026-08-20（继续，账号页群完全重写 + 根因修正）

### 根因修正（重要）
- 发现并修复一个明显偏离 FocuBili 源码的功能：ProfileHub"观看记录"入口指向了虚构的服务器端 `BilibiliWatchHistoryView`（调用 `x/v2/history`），
  但 FocuBili 源码里 `BilibiliAccountDataService` 只有 `loadFavoriteFolders`/`loadFavoriteVideos`/`loadFollowedCreators`/`loadSubscribedCollections`
  四个只读方法，根本没有服务器端观看历史接口/页面——"观看记录"入口在 FocuBili 里正确指向的是纯本机 `WatchHistoryPage`（SharedPreferences）。
  已改为指向已忠实移植的 `LocalWatchHistoryView`；移除 `accountService.ts` 里的 `listWatchHistory`/`parseWatchHistory`（`x/v2/history` 端点、
  FocuBili 不存在的功能）。

### BilibiliAccountViews.tsx 完全重写（378 行通用组件 → 570 行四个独立页面）
- 逐行对照 Dart 源码重写为四个独立组件，不再共用一个 `AccountDataView` 通用壳：
  - `BilibiliFavoritesView`（对齐 favorite_folders_page.dart 402 行）：搜索框 + 八态状态图标（success/signedOut/expired/networkError/
    permissionDenied/missingData/unavailable/malformedData）+ 重试/去登录 + 空状态 + 收藏夹封面角标"N 个视频"/"收藏夹已失效"
  - `FavoriteVideosView`（新增，对齐 favorite_videos_page.dart 481 行）：独立页面（新 ViewKey `favorite-videos` + store 里新增
    `activeBilibiliFavoriteFolder` + `openBilibiliFavoriteFolder` action），时长角标 + 多P角标 + 点击先 lookupVideo 再跳转播放 + 加载更多
  - `BilibiliFollowedView`（对齐 followed_creators_page.dart 449 行）：卡片信息层级对齐 Dart（昵称+认证图标 / "UID：xxx" / 认证描述 /
    签名），搜索框按昵称·UID·认证·签名筛选（仅前端过滤，不触发请求）
  - `BilibiliSubscribedCollectionsView`（对齐 subscribed_collections_page.dart 405 行）：合集卡"N 支视频 · UP主名"格式、
    ownerMid<=0 时提示"缺少 UP 主编号"而非直接跳转
- 移除死代码：文件内未被任何地方引用的旧 `BilibiliLoginView`（真正使用的是 `LoginView.tsx` 里同名导出）
- `BilibiliPlayerView.tsx`：修复 UP 主头像/昵称从纯展示 span 改为可点击 button，调用 `openBilibiliCreator` 打开主页（此前
  该 action 已注入但未接线，导致 tsc 报 unused-var）

### 测试
- 重写 `BilibiliAccountViews.test.tsx`：7 个测试覆盖四个新组件（收藏夹→跳转 favorite-videos 视图、未登录态、收藏夹内容渲染、
  关注列表 UID/认证、本地筛选不触发新请求、订阅合集元数据、未登录态）
- `accountService.test.ts`：两处 `listWatchHistory` 断言改为 `listFollowedCreators`（覆盖同一套 cookie/代理转发逻辑，功能未变）

### 验证结果
- `npx tsc --noEmit`：0 错误
- `npx vitest run`：69 个文件 / 291 个测试全部通过（连续三次运行稳定通过）
- 浏览器可视化回归：当前沙箱环境 Playwright 守护进程被系统权限限制无法启动（`AppData\Local\ms-playwright\daemon` 及项目内覆盖路径均在
  子进程创建阶段被拒绝），改为逐行对照 Dart 源码 + tsc/vitest 双重验证

### 待办（后续会话）
- [ ] LoginView.tsx 深挖：当前 157 行 vs login_page.dart 733 行，仍缺 Windows/Android 分支的扫码登录差异化、"切换账号"自动打开官方登录等细节
- [ ] 每页浏览器回归（待环境允许 Playwright 守护进程启动后补做）

## Session 2026-08-20（继续 3：LoginView 深挖对齐 + 切换账号根因修复）

### 根因修复
- `ProfileHub.openLogin(openOfficialOnStart)` 此前把参数直接丢弃（`void openOfficialOnStart`），导致"切换账号"/
  "重新登录"点击后只是普通跳转到登录页，完全没有对齐 FocuBili `LoginPage(openOfficialLoginOnStart: true)` 首帧自动
  打开官方登录的行为。已在 store 层新增 `loginAutoOfficial` 状态 + `openLogin(autoOfficial)` action，`ProfileHub`
  切换账号/重新登录时正确传递 `true`。

### LoginView.tsx 完全重写（157 → ~300 行，对齐 login_page.dart 733 行 + _OfficialQrLoginPage 扫码子页面）
- 此前 `createBilibiliQrLoginService`（accountService.ts 里已移植的扫码服务）从未被任何 UI 使用——登录页只有
  "打开官方网页 + 手动粘贴 Cookie"，与 FocuBili Windows 平台的 `LoginExperience.officialQrCode` 完全不符
- RIXIA 是 Web/Capacitor 应用，没有原生 WebView 可承载账号密码输入框，因此对齐 FocuBili **Windows 分支**（扫码为主）：
  - 手机号 Tab 改为"扫码"：复刻 `_OfficialQrLoginPageState` 完整状态机——生成二维码 → 2 秒轮询 →
    scanned/confirmed/expired 三态文案 → confirmed 后调用 `accountData.loadCurrentUser()` 补齐账号资料再 `auth.signIn` →
    expired 态展示"刷新二维码"按钮
  - 密码 Tab：对齐 Dart 版 Windows "密码登录：待开发"占位说明 + 禁用按钮
  - Cookie Tab：保留原有粘贴登录，补上 `htmlFor`/`id` 关联修复可访问性缺陷
  - 由"切换账号"打开时（`loginAutoOfficial: true`）自动定位到扫码 Tab（对齐 Dart `openOfficialLoginOnStart` 首帧回调）

### 测试
- 新增 `LoginView.test.tsx`（6 个）：默认扫码 Tab 自动生成会话、confirmed 后自动登录跳转、expired 态刷新按钮、
  Cookie 登录成功、Cookie 格式校验失败、密码 Tab 占位说明
- `ProfileHub.test.tsx` 新增 1 个回归测试：切换账号确认后 `view === "login"` 且 `loginAutoOfficial === true`

### 验证结果
- `npx tsc --noEmit`：0 错误
- `npx vitest run`：70 个文件 / 298 个测试全部通过（连续两次运行稳定）

### 待办（后续会话）
- [ ] 每页浏览器视觉回归（沙箱环境 Playwright 守护进程仍受限，需寻找其他验证路径或等环境放开）
- [ ] 继续排查 findings.md 矩阵中比例仍偏低的模块（如播放器手势细节、系统页群更多分支）

## Session 2026-08-20（继续 4：关于页更新卡片 + 应用更新架构对齐）

### 根因发现
- FocuBili 源码中**没有**独立的"应用更新"路由/页面——`about_page.dart` 直接内嵌完整的检查更新卡片（版本号 / 状态文案 /
  Release 摘要 / 下载或查看 Release 按钮 / 红点），并通过全应用共享的 `AppUpdateController` + `AppUpdateScope`
  (`InheritedNotifier`) 让启动 Toast、"我的"页设置入口红点、关于页三处共享同一份检查结果。
- RIXIA 之前有三份互相独立、逻辑重复且行为不一致的更新检查实现：
  1. `App.tsx` 内联 `useState` + `createAppUpdatePreferencesService` + `checkForUpdate`（仅用于启动 Toast）
  2. `SystemPages.tsx` 里独立的 `useAppUpdateCheck` hook + `AppUpdatePage` 组件（弱化模型，无 Release 摘要/下载链接/
     开关联动），挂在多余的 `app-update` 路由下
  3. `AboutView.tsx` 完全没有更新卡片
  这与 Dart 单一 `AppUpdateController` 共享状态的架构明显不符。

### 修复
- 新增 `src/features/bilibili/AppUpdateContext.tsx`：`AppUpdateProvider` + `useAppUpdateController()`，对齐
  `AppUpdateController`/`AppUpdateScope`；复用已有的 `checkForUpdate`/`AppUpdateResult`/`AppUpdateStatus`
  （`miscServices.ts`）和 `createAppUpdatePreferencesService`（`appUpdatePreferences.ts`），启动时按开关状态检查一次，
  `checkNow()` 始终可手动触发。
- `App.tsx`：移除内联 `startupUpdate` state/effect，改为 `AppUpdateProvider` 包裹 `Shell`，`AppUpdateBanner` 子组件
  订阅共享状态渲染启动 Toast（"查看"按钮改跳转 `about` 而非已删除的 `app-update`）。
- 删除 `SystemPages.tsx` 里重复的 `useAppUpdateCheck`/`AppUpdatePage`/独立 `APP_VERSION`/`LATEST_VERSION_URL`
  常量，改为从 `miscServices.ts` 导入统一的 `APP_VERSION`。
- 删除多余的 `app-update` ViewKey/路由/catalog 标题/Shell 全出血视图集合项（`types.ts`/`App.tsx`/`catalog.ts`/
  `Shell.tsx`）。
- `AboutView.tsx` 重写：新增完整检查更新卡片（状态文案对齐 Dart `_statusText` 六态、Release 摘要列表、
  下载安装包/查看 Release 按钮、红点）+ 问题诊断入口卡片（对齐 Dart `about_page.dart` 里的诊断入口 `ListTile`）。
- `ProfileHub.tsx`："设置"入口图标右上角新增红点，`hasUpdate` 来自共享 `useAppUpdateController()`（对齐 Dart
  `_ProfileTile(showBadge: hasUpdate)`）。
- `miscServices.ts` 导出 `APP_VERSION` 常量，消除此前 `App.tsx`/`SystemPages.tsx` 两处硬编码 `"0.3.0"` 的重复与
  潜在版本漂移风险。

### 测试
- 新增 `AppUpdateContext.test.tsx`（3 个）：启动自动检查一次、关闭开关后不自动检查、`checkNow()` 始终可手动触发
- `AboutView.test.tsx` 从 1 个扩充到 4 个：身份信息展示、问题诊断入口跳转、有新版本时展示摘要与下载链接、
  已是最新版本时不展示下载按钮

### 验证结果
- `npx tsc --noEmit`：0 错误
- `npx vitest run`：71 个文件 / 304 个测试全部通过（连续两次运行稳定）

### 待办（后续会话）
- [ ] 每页浏览器视觉回归（沙箱环境 Playwright 守护进程受限）
- [ ] 继续排查 `PersonalizationSettingsView` 里"启动时检查更新"开关是否需要联动 `useAppUpdateController`
      (`setEnabled` 后立即触发一次检查，对齐 Dart `AppUpdateController.setEnabled`)

### 补充（同会话续做：修复设置页更新开关双写问题）
- 发现 `PersonalizationSettingsView.tsx` 里"启动时检查更新"开关使用了独立的 `localStorage` key
  （`rixia_update_check_enabled_v1`），与 `AppUpdateProvider`/`appUpdatePreferences.ts` 实际读取的
  `rixia_focubili_startup_update_check_v1` 完全不同——用户在设置页关闭开关后，启动时仍然会继续检查更新，
  两者从未真正联动。已改为共用同一个 `createAppUpdatePreferencesService()`，并在重新开启开关时调用
  `useAppUpdateController().checkNow()` 立即触发一次检查（对齐 Dart `AppUpdateController.setEnabled` 的行为：
  关闭时不请求网络，重新开启后立即手动检查一次）。
- 新增 `PersonalizationSettingsView.test.tsx`（2 个测试）：开关读写共享存储、重新开启触发一次检查。

### 验证结果（最终）
- `npx tsc --noEmit`：0 错误
- `npx vitest run`：72 个文件 / 306 个测试全部通过（多次运行验证；`BilibiliPlayerView.test.tsx` 里一个既有的
  计时相关测试在满载并发运行时偶发超时，但单独运行 4/4 次稳定通过——确认是历史遗留的测试时序脆弱性，
  与本会话改动无关，不阻塞验收）

### 补充（同会话续做：迁移死视图 key，防止旧持久化状态卡在空白页）
- 系统性排查所有 `ViewKey` 在 `App.tsx` 是否都有对应路由分支，发现 `"watch-history"`（本会话早前移除的虚构
  服务器端观看历史）和 `"app-update"`（本次移除的多余独立更新路由）已从路由里删除，但类型定义和历史持久化状态
  里仍可能残留这两个值——若用户浏览器 localStorage 里恰好保存着这两个旧值，加载后会进入空白 `focubili-stage`
  （`App.tsx` 对未匹配的 view 什么都不渲染）。
- `src/lib/migrations.ts` 新增 `normalizeView()` + `LEGACY_VIEW_REDIRECTS` 映射表：
  `"watch-history"` → `"local-watch-history"`，`"app-update"` → `"about"`，其余值原样保留。
- `migrations.v3.test.ts` 新增 3 个测试覆盖两个重定向和"不影响其他 view"的回归保护。

### 验证结果（本轮最终，连续两次稳定）
- `npx tsc --noEmit`：0 错误
- `npx vitest run`：72 个文件 / 309 个测试全部通过

### 补充（同会话续做：合集面板补齐"加入学习清单"+ 定位当前视频）
- 逐项核对 `PlayerCollectionSheet.tsx`（合集选择面板）与 `player_collection_sheet.dart`，发现两处真实缺失：
  1. 面板打开时应自动滚动定位到当前播放视频（`_locateCurrent(animated: false)`），此前完全没有实现，长合集
     总是从第一条开始显示。
  2. 每个条目应有独立的"加入学习清单"按钮（`onAddToLearningList`），此前完全没有该入口，只能点击整行切换播放。
- 已修复：新增 `currentEntryRef` + `useEffect` 挂载后 `scrollIntoView`；新增 `onAddToLearningList` 可选 prop，
  条目行拆分为 `.player-collection-row`（播放按钮 + 独立加入按钮），点击加入不会关闭面板或触发切换播放。
- `BilibiliPlayerView.tsx` 新增 `addCollectionEntryToLearningList` 接线，复用已有 `learningListService`。
- 新增 CSS：`.player-collection-row` / `.player-collection-add`。
- 新增测试：`PlayerCollectionSheet.test.tsx` 从 1 个扩充到 3 个（加入学习清单不关闭面板、无 handler 时不渲染
  加入按钮）。

### 验证结果（本轮最终）
- `npx tsc --noEmit`：0 错误
- `npx vitest run`：72 个文件 / 311 个测试全部通过（连续两次运行稳定）
- `npm run build`：生产构建成功（`tsc --noEmit && vite build`，无报错）

### 补充（同会话续做：章节段/分段信息面板补齐）
- 逐项核对 `PlayerChapterStrip.tsx` / `video_chapter_widgets.dart`（504 行），发现两处真实缺失：
  1. Dart 章节条按真实时长比例分配宽度（`flex: chapter.duration.inMilliseconds`），RIXIA 之前是等宽分段。
  2. Dart 播放器有独立"分段信息"按钮（`Icons.view_timeline_outlined`），打开完整章节面板：标题+预览图+
     时间范围列表，并带"分段进度条"开关联动章节条显示/隐藏；RIXIA 完全没有这个入口和面板。
- 已修复：`PlayerChapterStrip.tsx` 改用 `chapterDuration()` 按比例 `flexGrow`；新增 `visible` prop 支持隐藏；
  新增 `PlayerChapterPanel.tsx`（预览图+标题+时间范围列表，点击跳转并关闭，含分段进度条开关）；
  `BilibiliPlayerView.tsx` 新增"分段信息"按钮（仅有章节时显示）+ `chapterProgressVisible`/`showChapterPanel` 状态。
- 新增测试：`PlayerChapterPanel.test.tsx`（3 个：当前章节高亮、点击跳转并关闭、开关联动）+
  `PlayerChapterStrip.test.tsx` 新增 1 个（`visible=false` 时不渲染）。

### 验证结果（本轮最终）
- `npx tsc --noEmit`：0 错误
- `npx vitest run`：73 个文件 / 315 个测试全部通过（连续两次运行稳定）
- `npm run build`：生产构建成功

### 补充（同会话续做：弹幕设置补齐轨道数量/滚动时长/合并相同弹幕）
- `DanmakuPreferences` 模型（`types.ts`）和渲染器（`danmakuRenderer.ts`）早就完整支持 `laneCount`/
  `scrollDurationSeconds`/`mergeRepeated` 三项设置，但播放器"弹幕设置"弹窗 UI 从未暴露对应控件——用户永远
  无法调整这三项，永久锁定在默认值。已在弹窗补齐"合并同时出现的相同弹幕"开关、"轨道数量"（1–24）和
  "滚动时长"（3–20 秒）两个滑杆，数值范围对齐 Dart `DanmakuPreferences` 的常量定义。
- 顺带修正 `danmakuRenderer.ts` 里 `laneCount` 归一化的上限从 30 改为 24（对齐 Dart `maxLaneCount = 24`）。
- 新增测试：`BilibiliPlayerView.test.tsx` 新增 1 个测试验证三个控件渲染、初始值和交互变更。

### 验证结果（本轮最终）
- `npx tsc --noEmit`：0 错误
- `npx vitest run`：73 个文件 / 316 个测试全部通过（连续两次运行稳定）
- `npm run build`：生产构建成功

### 补充（同会话续做：修复字幕关闭弹窗后消失的功能性 bug）
- 发现真实功能缺陷：`activeSubtitle` 的显示条件错误地依赖了 `showSubtitles`（字幕轨道选择弹窗的开关状态），
  导致用户选好字幕轨道、关闭选择弹窗后，屏幕上的字幕叠加层会立即消失——这与 FocuBili 的行为完全不符
  （Dart 版字幕显示只取决于是否选中了轨道，与选择面板是否打开无关，见 `player_overlay_coordinator.dart`
  的 `_selectedSubtitleTrack` 判断逻辑）。
- 已修复：`activeSubtitle` 判断条件改为只看 `selectedSubtitleId !== null`，与弹窗开关状态解耦。
- 新增测试：`BilibiliPlayerView.test.tsx` 新增"选择字幕轨道后关闭弹窗仍保持字幕可见"回归测试。

### 验证结果（本轮最终）
- `npx tsc --noEmit`：0 错误
- `npx vitest run`：73 个文件 / 317 个测试全部通过（连续两次运行稳定）
- `npm run build`：生产构建成功

### 补充（同会话续做：修复完播后本机观看记录不归零导致的续播 bug）
- 对照 FocuBili 测试用例"距结尾三秒的观看历史不参与续播"（`playback_resume_plan_test.dart`）和播放会话
  完播处理（`player_playback_session.dart` 的 `_flushCurrentWatchHistoryProgress(positionOverride: Duration.zero)`），
  发现真实功能缺陷：RIXIA 的 `playbackProgressStore.ts`（用于同分P内自动续播）已经正确实现了"距结尾 3 秒归零"
  归一化，但 `watchHistoryService`（"本机观看记录"列表，用户手动点击某条记录时会把 `positionSeconds` 直接作为
  `initialPlaybackTarget.seconds` 传入播放器，完全绕过 `playbackProgressStore` 的归一化逻辑）却没有做同样的处理——
  一部刚看完的视频，"本机观看记录"里会显示"上次看至 xx:57"，点击后会从倒数几秒的位置重新开始播放，而不是
  像 FocuBili 一样重新从头播放。
- 已修复：`BilibiliPlayerView.tsx` 记录观看历史时，`duration - currentTime <= 3`（即 `completed` 为真）时把
  `positionSeconds` 显式写为 `0`，与 `playbackProgressStore.ts` 已有的归一化逻辑保持一致。
- 新增测试：`BilibiliPlayerView.test.tsx` 新增"播放接近完成时记录的观看历史位置归零"回归测试。

### 验证结果（本轮最终）
- `npx tsc --noEmit`：0 错误
- `npx vitest run`：73 个文件 / 318 个测试全部通过（`BilibiliPlayerView.test.tsx` 在满载并发下偶发超时，
  与本次改动无关，已在文档中记录为历史遗留的计时脆弱性；单独/串行运行稳定 100% 通过）
- `npm run build`：生产构建成功

## Session 2026-08-20（继续 5：接入从未使用的 VideoNoteComposer，重建播放器笔记工作区）

### 根因发现（本轮最大差距）
- `VideoNoteComposer.tsx`（242 行，忠实移植自 `video_note_composer.dart` 645 行，含标题/正文/时间点/记录时间/
  分P标签/插入画面开关/跳转按钮/新建/删除/保存/紧凑与无边框模式/保存中禁用等完整功能）**从创建以来从未被任何
  地方实际引用**——`BilibiliPlayerCoordinator.tsx` 里的说明注释声称"VideoNoteComposer (notes workspace)"已被使用，
  但实际是误导性的死注释。
- `BilibiliPlayerView.tsx` 播放器内的"时间点笔记"区域用的是一个极简陋的替代实现：单个文本框 + 手动数字输入
  秒数 + 保存按钮，完全没有标题字段（拿正文第一行当标题）、没有编辑已有笔记的能力（只能新建）、没有删除、
  没有"跳转到时间点"、每次保存都无条件截图（没有"插入画面"开关）、没有自动保存。这与 FocuBili 播放器内
  `_PlayerNotesWorkspace` mixin（700+ 行真实交互逻辑：新建/选中编辑/自动保存 800ms 去抖/删除确认/跳转/
  画面截取时序控制）差距巨大。

### 修复：完整重建播放器笔记工作区
- 新增状态：`noteTitle`/`editingNoteId`/`notePositionSeconds`/`notePartCid`/`includeNoteFrame`/`noteFramePath`/
  `noteSaving`/`confirmDeleteNote` + `noteAutoSaveTimerRef`（对齐 Dart `_editingVideoNote`/`_notePosition`/
  `_notePartCid`/`_includeCurrentFrame`/`_noteFramePath`/`_noteSaving`/`_noteAutoSaveTimer`）
- `startNewNote()`：清空编辑器，锁定当前真实播放位置和分P（对齐 `_startNewVideoNote`）
- `selectNote(note)`：点击笔记条把已有内容载入编辑器，不改变播放位置（对齐 `_selectVideoNote`）
- `jumpToNotePosition()`：仅在用户点击独立按钮时才跳转分P和时间点（对齐 `_jumpToSelectedVideoNotePosition`）
- `saveNote(automatic)`：新建 vs 更新分流；非自动保存且标题为空时提示"请先填写笔记标题。"并拒绝保存；
  自动保存标题正文都为空时静默跳过；`includeNoteFrame` 开启且没有缓存画面时才截图（对齐 Dart 的懒截图策略）
- `scheduleNoteAutoSave()`：800ms 去抖自动保存（对齐 `_noteAutoSaveDelay`），标题/正文/画面开关变化都会触发
- `deleteEditingNote()`：改为二次确认对话框（`M3Dialog`）后删除，不再是无确认操作
- 笔记区 UI 从内嵌粗糙表单换成：横向笔记条状列表（点击载入编辑，当前编辑项高亮，对齐 Dart 竖屏笔记条）+
  正式接入的 `VideoNoteComposer`（`borderless` 模式，标题/正文/时间点/记录时间/分P标签/插入画面开关/
  跳转按钮/新建/删除/保存一应俱全）
- 新增/调整 CSS：`.fb-player-note-strip`/`.fb-player-note-chip`/`.fb-player-note-composer-wrap`，移除废弃的
  `.fb-player-notes-input`/`.fb-player-note-list`/`.fb-player-note-body`

### 测试
- 新增 4 个测试：标题+正文保存后出现为笔记条、无标题时拒绝显式保存并提示、点击已有笔记条把内容载入编辑器
  可再次编辑、删除当前编辑笔记需二次确认

### 验证结果
- `npx tsc --noEmit`：0 错误
- `npx vitest run`：73 个文件 / 322 个测试全部通过（连续两次运行稳定）
- `npm run build`：生产构建成功
- 未影响 `VideoNotesView.tsx`/`VideoNoteDetailDialog.tsx`（各自独立测试通过），三者共享同一个 `videoNoteService`
  数据源，字段结构一致

## Session 2026-08-20（继续 6：修复"继续学习/关联专注"零位置强制重播 bug）

### 浏览器可视化验证再次受阻
- 尝试用系统已安装的 Chrome（`--headless=new --remote-debugging-port`）绕开 Playwright 守护进程直连 CDP 截图，
  连续 3 次 `Start-Process` 请求均被审批审核服务基础设施故障（503 Service Unavailable）拦截，与上一会话的
  Playwright 路径遇到的是同一类不可控外部阻塞。按规则不再重试，转回源码级差距深挖。

### 根因发现
- 对照 FocuBili 测试用例"零位置专注记录保留原生观看历史恢复"（`focus_video_launcher_test.dart`）和
  `FocusVideoLauncher.buildPlayerPage` 的显式注释"零位置交给原生观看历史恢复，避免强制跳回开头"：
  `sourcePosition > Duration.zero ? sourcePosition : null` —— 只有真实大于零的保存位置才会强制指定播放起点，
  否则传 `null`，让播放器走正常的"从本机记录恢复进度"逻辑。
- RIXIA 的 `FocusDashboard.tsx` 里"继续学习"/"关联专注"入口（`openLinkedVideo`）无条件把
  `Math.floor(sourcePositionMs / 1000)` 传给 `openBilibiliVideoAt`，`BilibiliPlayerView.tsx` 收到
  `initialPlaybackTarget = { cid, seconds: 0 }` 后仍会把它当作"显式指定的位置"强制 `setCurrentTime(0)`，
  完全覆盖 `playbackProgressStore`（本机保存的真实播放进度）——只要一条专注记录/学习任务碰巧保存的秒数是 0
  （刚加入还没真正播放过，或恰好落在整数边界），点击"继续学习"就会强制从头播放，而不是恢复到用户上次真正
  看到的位置。

### 修复
- `BilibiliPlayerView.tsx` 两处 `initialPlaybackTarget` 应用逻辑均新增 `initialPlaybackTarget.seconds > 0`
  条件，零秒目标不再强制覆盖播放位置，交由 `playbackProgressStore.load()` 的本机保存进度接管，与
  Dart 的 `sourcePosition > Duration.zero` 判断完全对齐。

### 测试
- 新增回归测试："当专注/学习目标没有记录到具体秒数时，从本机保存的真实进度恢复而不是强制归零"——
  先手动验证测试在回退修复后确实失败（证明测试有效），恢复修复后转为通过
- 修复 `BilibiliPlayerView.test.tsx` 缺失 `localStorage.clear()` 的测试隔离问题（`beforeEach` 补充清理，
  避免新测试写入的进度数据污染同文件内其他测试）

### 验证结果
- `npx tsc --noEmit`：0 错误
- `npx vitest run`：73 个文件 / 323 个测试全部通过（连续两次运行稳定）
- `npm run build`：生产构建成功

### 补充（同会话续做：修复"从搜索直接打开视频"不会自动续播到上次观看分P/位置的 bug）
- 对照 `playback_resume_plan.dart` 的 `resolve()` 优先级链（用户明确请求 > 平台/本机保存进度 > 本机观看历史 >
  默认分P），发现 RIXIA 之前只实现了前两层——直接从搜索结果、UP主主页等入口打开视频时（没有携带
  `initialPlaybackTarget`），`targetPart` 硬编码为 `v.cid`（视频默认第一P），完全不查询本机观看历史。
  这意味着如果用户之前看到了 P3 的某个位置，下次直接搜索/点开同一视频（而不是特意去"本机观看记录"页面点击），
  会从 P1 的 0 秒重新开始，而不是像 FocuBili 一样自动跳回 P3 上次看到的位置。
- 已修复：`BilibiliPlayerView.tsx` 挂载时若无 `initialPlaybackTarget` 且当前默认分P没有本机保存进度
  （`playbackProgressStore`），查询 `watchHistoryService.list()`，找到匹配 bvid 的记录后：若其分P仍存在于
  当前视频、位置大于 0 且未落在"距结尾 3 秒内"（对齐 Dart `normalizeStoredPosition` 的边界豁免），则切换到
  该分P并恢复到记录的位置。用 `historyResumeTargetRef`（一次性消费，对齐 `initialTargetAppliedRef` 的语义）
  避免第二个"分P切换恢复位置"副作用把历史续播位置覆盖回 0。

### 测试
- 新增回归测试："无明确目标时从本机观看历史恢复到上次观看的分P和位置"——先临时禁用新逻辑验证测试确实失败
  （证明测试有效），恢复后转为通过
- 修复 `watchHistoryService` mock 的 `list` 从无返回值改为默认 `resolvedValue([])`，避免新逻辑读取
  `undefined.find(...)` 报错；`beforeEach` 补充重置该 mock 默认值

### 验证结果（本轮最终）
- `npx tsc --noEmit`：0 错误
- `npx vitest run`：73 个文件 / 324 个测试全部通过（连续两次运行稳定）
- `npm run build`：生产构建成功

### 补充（同会话续做：续播提示文案 + 浏览器可视化验证的环境限制说明）
- 补齐续播提示：对齐 `player_playback_session.dart` 的 `_showResumeNotice`/`_showRequestedInitialPositionNotice`，
  播放器挂载时如果自动跳转到了明确目标位置或本机观看历史位置，会在视频画面顶部短暂显示"已跳转到指定位置：mm:ss"
  或"已跳转到上次观看记录：mm:ss"提示（3 秒后自动消失，随控制层显示状态上移，不遮挡进度条），此前完全没有
  这个用户反馈。手动切换分P时按 Dart 语义显式清除该提示（不重复弹出）。
- 新增 2 个测试覆盖两种提示文案的正确显示。

### 浏览器可视化验证：环境限制记录
用户明确要求调用已安装的 Codex 插件控制电脑查看效果。已按顺序尝试：
1. `chrome:control-chrome` 技能要求的 `node_repl`（`mcp__node_repl__js`）工具在本次会话里未被实际暴露/连接
   （`list_mcp_resources` 返回空），技能文档存在于磁盘但底层运行时不可用。
2. 直接用 `exec_command` 以 `require_escalated` 启动系统已安装的 Chrome/Edge 无头模式，连续多次尝试
   （本轮 3 次 + 上一轮 3 次，共 6 次）均被同一个外部审批审核服务基础设施故障拦截（HTTP 503
   Service Unavailable，"No available channel for model gpt-5.6-luna"）。
3. 用一条完全无害的只读命令（`Get-Date`）验证，确认连这种命令也被同一 503 拦下——证明是审核服务
   本身的基础设施故障，而不是针对具体命令的风险判定，当前环境下整条"需要升级权限"的执行通道均不可用。
结论：本环境下浏览器/GUI 级可视化验证目前不可行（非策略拒绝，是外部服务故障）。已改用可行的替代验证手段：
`npx tsc --noEmit`（类型正确性）、`npx vitest run`（DOM 渲染断言级别的行为正确性，73 文件/325 测试）、
`npm run build`（生产构建产物完整性）三者组合，加上逐行对照 FocuBili Dart 源码的人工审查。

### 验证结果（本轮最终）
- `npx tsc --noEmit`：0 错误
- `npx vitest run`：73 个文件 / 325 个测试全部通过
- `npm run build`：生产构建成功

## Session 2026-08-20（继续 7：修复顶栏专注倒计时显示逻辑差异）

### 环境限制复核（第 7 次尝试）
- 用一条完全无害的只读命令（`Get-Date`）再次探测升级权限审批通道，仍返回同一个 503（"No available
  channel for model gpt-5.6-luna"）。已连续两轮会话、7 次尝试遇到完全相同的外部服务故障，确认这是环境层面
  的基础设施问题，不属于我可以绕过或修复的范围。转为继续做源码级差距排查，保持目标推进。

### 根因发现
- 对照 `player_layout_widgets.dart` 的 `_FullscreenDeviceStatus._buildFocusStatus`：当专注会话
  `completeOnPartEnd == true` 且会话来源分P正是当前播放的分P时，顶栏应显示"当前分P播放剩余时长"
  （`duration - currentPosition`），而不是专注计时器自身的原始倒计时——因为这种场景下专注任务的完成时机
  由"看完这一P"决定，倒计时数字如果继续用专注计时器的固定剩余时间会跟视频进度脱节，误导用户。
- RIXIA 的 `focusPlaybackPolicy.ts`（`buildVideoFocusRequest`）里 `completeOnPartEnd: true` 是**所有从播放器
  发起的专注任务的默认值**，意味着这个显示分支在实际使用中触发频率很高，但 `BilibiliPlayerView.tsx` 顶栏
  一直无条件显示 `focusTimer.remainingMs`（专注计时器原始剩余时间），从未按分P播放进度切换显示。

### 修复
- 新增派生值 `focusFollowsCurrentPart`（会话 `completeOnPartEnd` 且 `sourceBvid`/`sourcePartCid` 匹配当前
  播放的视频/分P）+ `visibleFocusRemainingMs`（匹配时用 `duration - currentTime` 换算毫秒，否则回退
  `focusTimer.remainingMs`），顶栏专注状态条改用这个派生值渲染。

### 测试
- 新增回归测试："专注会话跟随当前分P时，顶栏显示分P剩余播放时长而非专注计时器原始倒计时"——先临时回退
  验证测试确实失败（证明有效），恢复后转为通过

### 验证结果
- `npx tsc --noEmit`：0 错误
- `npx vitest run`：73 个文件 / 326 个测试全部通过（连续两次运行稳定）
- `npm run build`：生产构建成功

### 补充（同会话续做：专注任务结束时自动暂停播放并提示）
- 对照 `player_focus_coordinator.dart` 的 `_handleFocusStateChanged`/`_handleFinishedFocus`：专注控制器的
  `activeSession` 变为 `null` 且 `lastFinishedSession` 是刚才那条记录时（新的结束事件，不是残留的旧状态），
  应该：若视频在播放则自动暂停，并显示"专注完成，视频已暂停"或"专注已结束，视频已暂停"（按
  `FocusSessionStatus.completed` 还是提前结束区分文案）。
- RIXIA 的 `useFocusTimer.ts` 已经完整具备 `activeSession`/`lastFinishedSession` 状态模型，但
  `BilibiliPlayerView.tsx` 从未监听这个转换——专注任务结束后视频会继续播放，用户完全不会收到任何提示，
  这是一个高频触发（默认所有视频关联的专注任务都会用到）且明显偏离原版体验的功能缺陷。
- 已修复：新增 `observedFocusSessionIdRef` 跟踪上一次观察到的活跃会话 id（对齐 Dart 的
  `_observedFocusSessionId`），新增 `useEffect` 检测"活跃会话消失 + lastFinishedSession.id 匹配刚才那条"
  的转换边沿，触发时若正在播放则调用 `pause()` 并 `setPlaying(false)`，同时显示对应文案（复用
  `learningListMessage` 提示区，2.4 秒后自动消失）。

### 测试
- 新增回归测试："专注会话结束时自动暂停播放并显示提示"——先临时禁用新 effect 验证测试确实失败
  （证明有效），恢复后转为通过

### 验证结果（本轮最终）
- `npx tsc --noEmit`：0 错误
- `npx vitest run`：73 个文件 / 327 个测试全部通过（连续两次运行稳定；一次满载并发下 `BilibiliPlayerView.test.tsx`
  里一个既有测试偶发超时，重跑即通过，与本次改动无关，属于历史遗留的计时脆弱性）
- `npm run build`：生产构建成功

### 补充（同会话续做：修复首页"上次看到"预览画面/位置从未更新的 bug）
- 对照 `player_focus_coordinator.dart` 的 `_saveFocusLastSeen`（在切换分P前、以及退出播放器时调用）：
  只要专注会话已关联到当前正在播放的视频/分P，就应该把最新播放位置和一帧画面写回会话，供
  `focus_dashboard.dart` 的"继续学习"卡片展示"上次看到"预览。
- RIXIA 的 `useFocusTimer.ts` 已经完整实现了 `updateLastSeen()`（含 `hasVideoAssociation` 判断），
  `FocusDashboard.tsx` 也已经在读取 `session.sourceFramePath`/`session.sourcePositionMs` 渲染预览图和位置文案，
  但 `BilibiliPlayerView.tsx` 从未调用过 `updateLastSeen`——这意味着"上次看到"的画面和时间点永远停留在专注
  任务刚创建/关联那一刻的状态，用户实际看了多久完全不会同步更新到首页卡片上。
- 已修复：新增 `saveFocusLastSeen()`（校验 `session.sourceBvid`/`sourcePartCid` 与当前播放视频/分P匹配，
  截取当前时间点画面并调用 `updateLastSeen`），在两个时机调用：`selectPart()`（切换分P前，对齐 Dart
  `_deactivateFocusPlaybackForCurrentPart`）+ 组件卸载时（对齐 Dart 退出播放器前的调用，用 ref 持有最新闭包
  避免读到挂载瞬间的旧值）。

### 测试
- 新增 2 个回归测试："切换分P时保存最后画面和位置"、"播放器卸载时保存最后位置"——先临时禁用新逻辑验证
  两个测试都确实失败（证明有效），恢复后转为通过

### 验证结果（本轮最终）
- `npx tsc --noEmit`：0 错误
- `npx vitest run`：73 个文件 / 329 个测试全部通过（连续两次运行稳定）
- `npm run build`：生产构建成功

### 补充（同会话续做：补齐主动关联专注任务的提示对话框）
- 对照 `player_focus_coordinator.dart` 的 `_maybePromptFocusAssociation` + `player_focus_sheet.dart` 的
  `showFocusVideoAssociationSheet`：当存在一个活跃但尚未关联任何视频的专注任务（比如从首页专注台直接开始，
  没有指定具体视频），且播放器就绪时，应该主动弹出"是否将'{目标}'关联到当前播放的视频？"确认框，而不是
  要求用户自己发现并点击"关联专注"按钮。用户点"取消"后，同一个视频+分P不会重复打扰，但切换到新视频/分P
  后会再次询问。
- RIXIA 之前只有被动的手动入口（点击顶部按钮触发 `associateVideo`），完全没有这个主动提示，容易导致用户
  不知道可以关联、专注任务和播放行为长期脱节。
- 已修复：新增 `associationPromptSessionId` 状态 + 判定 effect（会话存在、处于活跃状态、未关联视频、
  播放器已加载完成、不是刚被用户取消的同一候选）+ `M3Dialog` 确认框，文案对齐 Dart 原文
  "是否将"{goal}"关联到当前播放的视频？" + 视频标题/分P信息；确认后调用 `associateVideo`（补充当前时间点
  截图）并显示"已关联视频：..."提示；取消后记录 `dismissedAssociationCandidateRef`（视频+分P 维度）并显示
  "我们将在新的视频提示你关联"。

### 测试
- 新增 2 个回归测试："存在未关联视频的专注任务时主动弹出关联确认框，确认后调用 associateVideo"、
  "取消关联后同一视频不会重复弹出提示"——先临时禁用新 effect 验证测试确实失败（证明有效），恢复后转为通过

### 验证结果（本轮最终）
- `npx tsc --noEmit`：0 错误
- `npx vitest run`：73 个文件 / 331 个测试全部通过（连续两次运行稳定）
- `npm run build`：生产构建成功

### 补充（同会话续做：补齐"离开播放器打断专注任务"两步确认流程）
- 对照 `player_focus_coordinator.dart` 的 `_requestLeavePlayer`：当专注任务正跟随当前播放的视频/分P时
  （`session.isActive && session.sourceBvid == 当前bvid && session.sourcePartCid == 当前cid`），点击"返回资料库"
  不能直接离开，必须先走"鼓励继续 → 填写打断原因"两步确认流程（`FocusInterruptionKind.playerExit`），
  确认打断后才真正离开，且离开前要补存最后画面和位置（复用刚修复的 `saveFocusLastSeen`）。
- RIXIA 早前会话已经完整移植了这个两步流程组件（`FocusDialogs.tsx` 的 `FocusInterruptionFlow` +
  `FocusInterruptionKind.playerExit` 枚举值），但只在 `FocusDashboard.tsx`（首页手动"暂停"按钮）里接线，
  播放器的"返回资料库"按钮从未使用它——点击就直接离开，完全没有任何专注打断的保护，容易在专心看课时
  被无意的返回操作打断整个专注记录。
- 已修复：新增 `focusSessionTracksCurrentPart()` 判定 + `requestLeavePlayer()` 网关函数（不满足条件时直接
  `setView("library")`，满足时先弹出 `FocusInterruptionFlow`），`onDone(interrupted)` 为 `true` 时才真正离开
  并补存最后画面/位置；"返回资料库"按钮的 `onClick` 从直接 `setView("library")` 改为调用这个网关函数。

### 测试
- 新增 2 个回归测试："专注任务跟随当前分P时，返回资料库会被打断流程拦截，选择继续专注则留在播放器"、
  "确认打断原因后才真正离开播放器且触发 interruptFocus"——先临时禁用网关逻辑验证测试确实失败（证明有效），
  恢复后转为通过

### 验证结果（本轮最终）
- `npx tsc --noEmit`：0 错误
- `npx vitest run`：73 个文件 / 333 个测试全部通过；额外验证 `BilibiliPlayerView.test.tsx` 单独运行 4/4 次
  100% 稳定（23/23），确认满载并发下偶发的单测超时是环境计时敏感性，与本次改动无关
- `npm run build`：生产构建成功

### 补充（同会话续做：补齐"上一集/下一集"控制栏按钮 + 修复满载并发下的测试超时脆弱性）
- 对照 `player_page_view.dart`：多分P视频的控制栏应在播放/暂停按钮旁显示"上一集"/"下一集"两个快捷按钮
  （`_playPreviousPart`/`_playNextPart`，首/末分P时对应按钮禁用），RIXIA 之前只能通过打开"选集"面板切换
  分P，完全没有这个一键切换的快捷入口。已在控制栏播放按钮和"后退 10 秒"之间补上 `SkipBack`/`SkipForward`
  两个按钮（仅多分P视频显示，边界分P时正确禁用）。
- 新增回归测试："通过控制栏上一集/下一集按钮在分P之间切换，边界正确禁用"——先临时禁用按钮验证测试确实
  失败（证明有效），恢复后转为通过。

### 修复满载并发下 vitest 测试偶发超时
- 系统排查发现：完整测试套件（73 文件）满载并发运行时，`BilibiliPlayerView.test.tsx` 里的
  `waitFor(...)` 断言在约 50% 的运行中会随机超时失败（4 次全量运行里 2 次失败，且每次失败的具体用例都不同，
  包括本会话新增测试和早于本会话就存在的原始测试），但同一个文件单独运行连续 4/4 次 100% 稳定。
- 根因：`@testing-library/dom` 的 `waitFor()` 默认超时是 1000ms（`asyncUtilTimeout`），当 73 个测试文件的
  jsdom 环境并行调度导致事件循环被大量挤占时（本机满载并发下"environment"阶段耗时高达 145-150 秒），
  1000ms 窗口内偶尔来不及完成断言轮询，属于测试基础设施层面对高并发场景考虑不足，而非被测代码逻辑错误
  （所有相关新功能均已在关闭功能后单独验证测试会确定性失败，恢复后确定性通过）。
- 已修复：在 `src/test/setup.ts` 里全局调用 `configure({ asyncUtilTimeout: 4000 })`，把默认等待窗口从
  1000ms 提高到 4000ms，只影响测试基础设施，不改变任何被测源码逻辑。
- 验证：修复前满载并发运行 4 次，2 次失败；修复后连续运行 7 次，6 次完全干净（334/334，含 1 次仅有
  一条良性未处理错误警告但未导致任何测试失败），显著改善。

### 验证结果（本轮最终）
- `npx tsc --noEmit`：0 错误
- `npx vitest run`：73 个文件 / 334 个测试，修复超时脆弱性后连续多次运行基本稳定
- `npm run build`：生产构建成功

## Session 2026-08-22（新会话：修复搜索/扫码登录/账号数据三大问题 + 考研功能扩展）

### 修复 1：扫码登录二维码永不显示（根因：外部服务依赖）
- 旧实现用 `https://api.qrserver.com/v1/create-qr-code/` 生成二维码图片——该服务在国内网络经常无法访问，
  二维码永远加载不出来。已改为本地生成：新增 `qrcode` npm 依赖，`LoginView.tsx` 用
  `QRCode.toDataURL()` 在浏览器内渲染（392px PNG data URL），零外部依赖。
- 浏览器实测：二维码 2 秒内渲染，generate/poll 全链路 200。

### 修复 2：扫码确认后登录态是假的（根因：cookieHeader 占位字符串）
- 旧实现 poll 确认后返回 `cookieHeader: "confirmed"` 字面量，`auth.signIn("confirmed")` 把这个
  假 Cookie 存进 localStorage——所有账号数据请求（收藏夹/关注/订阅）实际不带任何凭证，
  B站返回 -101/-400，UI 显示"登录已过期"。这是"账号扫码出问题"的根本原因。
- 修复链路：
  1. `vite.config.ts` `/bili-passport` 代理新增 `proxyRes` 钩子，把 passport 下发的 Set-Cookie 中
     具备登录效力的字段（SESSDATA/bili_jct/DedeUserID/buvid 等）合入 `x-bili-set-cookie` 响应头；
  2. `httpAdapter.ts` 新增 `requestJsonWithHeaders()`（保留响应头访问的跨环境请求，原生走
     CapacitorHttp headers，浏览器走代理后 fetch headers）；
  3. `accountService.ts` poll 改用它，确认时从响应头提取真实 Cookie 串 + mid，返回给调用方；
  4. `LoginView.tsx` 用真实 Cookie signIn（捕获不到时才回退 "confirmed" 标记 = 原生 Cookie Jar 模式）。
- **用户实测：真实扫码登录成功，SESSDATA 正确入库，用户名/头像通过 nav 接口拉取成功。**

### 修复 3：账号数据全部为空（根因：移植时丢失全部必需查询参数）
- 对照 Dart 源码逐项核实，TS 移植丢了所有参数/用错接口：
  | 功能 | 修复前 | 修复后（对齐 FocuBili Dart） |
  |---|---|---|
  | 收藏夹列表 | `/x/v3/fav/folder/created/list-all`（无参数 → -400） | 加 `up_mid={mid}` |
  | 收藏夹内容 | 只有 media_id/pn/ps | 补 `platform=web&order=mtime&type=0&tid=0`；totalCount 改读 `data.info.media_count` |
  | 关注列表 | 无 vmid、ps=20 → -400 | 加 `vmid={mid}`、ps=50；hasMore 改 `page*50 < total` |
  | 订阅合集 | 错用 `created/list`（自己的收藏夹） | 改 `/x/v3/fav/folder/collected/list?up_mid=&platform=web`，只保留 type=21 的 UGC 合集 |
- 新增 `resolveMid()`：所有账号接口需要本人 mid；缺失或等于 2^31 钳位残留值时先调 nav 接口
  解析真实 mid 并回写会话（新注册账号 mid 已超过 2^31，旧 readInteger 上限 2^31 会截断）。
- `readInteger` 上限放宽到 Number.MAX_SAFE_INTEGER；新增 `readErrorCode`（带符号）——旧的
  readInteger 把负数错误码钳位成 0，导致 -101 登录过期永远不会显示正确状态。
- 收藏视频 duration 字段修正：resource/list 返回的是秒数（number），不是 "mm:ss" 文本。
- **用户账号实测：38 个收藏夹（默认收藏夹 942 个视频）、收藏夹内视频卡片、506 个关注
  （含认证徽标/超大 UID）、订阅合集列表（线代救命/六级/嵌入式等）全部正确渲染。**

### 修复 4：生产构建（vite preview）下搜索 404
- `proxyUrl()` 在 127.0.0.1/localhost 下会改写请求到 `/bili-*` 代理路径，但代理只配在
  `server` 里——`npm run preview`（生产构建本地预览）没有代理，全部请求 404。这就是
  "搜索视频出问题"在非 dev 环境的根因。
- 修复：把整份 bilibili 代理配置提取为共享常量，同时挂到 `server.proxy` 和 `preview.proxy`。
- 实测：preview 生产构建下搜索"考研英语"正常返回并渲染完整结果列表。

### 测试与验证
- 新增 4 个 QR Cookie 捕获单测（代理头提取/重定向参数兜底/未确认不泄漏/本地代理路由）
- 更新 2 个账号视图测试 mock 为真实 API 字段形状（official_verify.desc、type=21/media_count）
- `npx tsc --noEmit`：0 错误；`npx vitest run`：348/348 全过；`npm run build` 成功
