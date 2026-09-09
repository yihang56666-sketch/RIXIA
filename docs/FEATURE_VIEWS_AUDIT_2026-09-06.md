# B 站功能视图有界审计与修复

日期：2026-09-06。仓库：`<repo-root>`。

## 1. 交付边界与结论

- 本轮逐行阅读了下表中的 15 份视图源码及其已有邻接测试；不是对整个目录、服务层或原生端的无遗漏认证。
- 修改 7 份视图源码、6 份已有邻接测试，新增 1 份账号视图竞态测试和本报告。新增回归用例共 46 项。
- 最终有界回归：15 个测试文件、114 项测试通过，退出码 0。最后一次 `npm run typecheck` 退出码 0。
- `git diff --check` 对本轮路径通过；没有运行全仓库测试、生产构建或真人登录后的端到端验证。
- 不修改 `BilibiliPlayerView.tsx/.test.tsx`、`useFocusTimer.ts/.test.ts`、`m3.tsx`、`src/lib/`、`src/store/`、`App.tsx`、其他 feature 或原生代码。共享工作区中这些路径的变化不属于本轮交付。
- 没有 commit、push、创建分支、修改真实凭据、调用真人账号写接口、启动服务或占用端口。网络行为仅发生在测试隔离/mock 或已有测试允许的只读路径；没有用样例数据替代生产指标。
- 根目录及相关祖先/子目录没有发现实体 `AGENTS.md`；按委派消息提供的根约束执行。窄委派按授权跳过 Superpowers bootstrap，使用 systematic-debugging、test-driven-development、error-handling、verification-before-completion。
- 所有文件变更通过用户指定的 `codex.exe --codex-run-as-apply-patch` 入口执行。

## 2. 实际逐行阅读清单

以下路径均相对于仓库根目录。这里的“全读”指本轮读取了完整源码，不表示所有异常分支均有动态覆盖。

| 完整读取的源码 | 完整读取的邻接测试 | 本轮处理 |
| --- | --- | --- |
| `src/features/bilibili/BilibiliSearchView.tsx` | `BilibiliSearchView.test.tsx` | 修复请求失效、导航、键盘、清单 ID、持久化错误 |
| `src/features/bilibili/CreatorCollectionViews.tsx` | `CreatorCollectionViews.test.tsx` | 修复 UP 主/合集状态隔离、分页、键盘、持久化错误、重试 |
| `src/features/bilibili/BilibiliAccountViews.tsx` | `BilibiliAccountViews.test.tsx`；新增 `BilibiliAccountViews.race.test.tsx` | 审阅四类账号页面，修复收藏内容/关注/订阅分页与导航 |
| `src/features/bilibili/LearningListView.tsx` | `LearningListView.test.tsx` | 修复写入失败反馈及拖动期间 DOM 重建 |
| `src/features/bilibili/VideoNotesView.tsx` | `VideoNotesView.test.tsx` | 修复删除失败、封面保存失败、键盘与导出入口 |
| `src/features/bilibili/VideoNoteDetailDialog.tsx` | `VideoNoteDetailDialog.test.tsx` | 修复保存拒绝后的编辑器锁定、过期来源导航 |
| `src/features/bilibili/VideoNoteComposer.tsx` | 原目录没有同名邻接测试 | 只读审阅受控输入、字数限制、截图错误重置、saving 控件 |
| `src/features/bilibili/SystemPages.tsx` | `SystemPages.test.tsx` | 只读审阅缓存/诊断/Android/Windows 页面，保留风险项 |
| `src/features/bilibili/HomeFeedView.tsx` | `HomeFeedView.test.tsx` | 只读审阅关键词发现、历史、错误/空状态与播放器路由 |
| `src/features/bilibili/FocusDashboard.tsx` | `FocusDashboard.test.tsx` | 只读审阅继续学习、任务创建、关联视频、汇总、吸附与弹窗 |
| `src/features/bilibili/FocusStatisticsView.tsx` | `FocusStatisticsView.test.tsx` | 修复搜索输入重建；统计/删除契约等列入剩余风险 |
| `src/features/bilibili/FocusDialogs.tsx` | `FocusDialogs.test.tsx` | 只读审阅完成、打断、终止、自定义时长等弹窗 |
| `src/features/bilibili/ProfileHub.tsx` | `ProfileHub.test.tsx` | 只读审阅身份刷新、功能入口、切换/退出账号 |
| `src/features/bilibili/PersonalizationSettingsView.tsx` | `PersonalizationSettingsView.test.tsx` | 只读审阅播放设置、主题映射、更新开关与系统入口 |
| `src/features/bilibili/LoginView.tsx` | `LoginView.test.tsx` | 只读审阅 QR 轮询、Cookie 本地入口、密码未开发状态 |

附带只读契约检查：

- `package.json`、`vitest.config.ts`、`src/test/setup.ts`：运行方式、jsdom、Testing Library 的 4 秒等待超时。
- `src/lib/bilibili/services.ts`：只读 SearchHistory、LearningList、VideoNote 和 PlaybackPreferences 的相关接口/实现片段。确认写操作返回 `Promise<boolean>`，`false` 不会自动变成异常；清单 `remove` 接收持久化 `entry.id`，不是 `bvid:cid`。
- `src/lib/bilibili/accountService.ts`：只读账号列表接口、`resolveMid` 和四类列表实现片段。确认这些列表实现把错误转换成 `AccountDataPage.status`，并非要求视图依赖 Promise rejection。
- `src/features/bilibili/m3.tsx`：仅在开始时只读原有 M3Dialog props、反馈 context 和消息显示契约；未修改，也不把主线程后续 overlay 改动算作本轮审阅结果。

没有逐行读取其他服务实现、store、App、原生代码，也没有核对注释所称的上游 Flutter 逐像素等价性。

## 3. 已复现并修复的问题

### A. Search（11 项新增回归）

1. **候选词覆盖新输入**：先请求旧词建议、随后请求新词建议；旧响应后到时，闭包中的 `keyword.trim() === input` 永远只比较旧值。改为独立请求代数判定。
2. **清空输入不终止当前搜索**：搜索未返回时点击清空，仍停留 loading，旧响应还可以写回。清空/切换模式同步失效搜索和建议请求，重置加载与 opening 状态。
3. **新搜索被旧分页锁住**：第一页后的加载更多仍 pending 时提交另一关键词；新结果无法继续分页。新搜索重置分页锁，旧请求的 finally 不再解除新请求的锁。
4. **过期视频查询重新导航**：点击结果后离开视图，旧 lookup 的成功或回退路径仍能打开播放器。视图卸载/新搜索使该导航请求失效。
5. **键盘无法激活结果**：视频/用户卡片有 `role="button"` 和 tabIndex，却没有 Enter/Space 处理。新增键盘激活，并避免卡片内部按钮的事件冒泡触发外层导航。
6. **从搜索取消学习任务永远删除失败**：传给服务的是 `bvid:cid`，但实际删除键为随机 `entry.id`。用稳定分 P 键映射到真实 entry ID。
7. **清单写/删失败和历史清除失败无反馈**：处理返回 false 与异常；清除历史失败保留确认框。添加操作遇到 false 时重读清单，区分已存在条目与确实没有保存成功，避免把正常去重当成失败。

### B. Creator / Collection（10 项新增回归）

1. UP 主 A 的资料请求比 B 后返回，A 的资料覆盖 B；给资料请求独立代数和清理。
2. 切换 UP 主/投稿条件后仍保留旧列表，若新请求失败，旧内容使错误分支不可见；新首屏请求清理旧内容和计数。
3. 旧 tab 分页 pending 后切换 tab，loadingMore 永不复位；新首屏清理分页锁，旧响应不写新状态。
4. 合集 A 的分页结果追加进合集 B；所有合集首屏/分页使用同一请求代数，并在切换/卸载时失效。
5. 嵌套“加入学习清单”按钮收到 Enter 时冒泡到外层视频行，误开播放器；外层只响应自身的键盘事件。
6. 两类视图的 `add(false)` 仍显示已加入；增加持久化后置检查，只有已实际存在的条目才视为达到目标。
7. 两类视图在卸载后的 lookup 成功仍调用 onOpenVideo；用内容请求代数保护回调。
8. 合集首次请求失败只有文字而没有重试路径；加入原地重试，复用同一首屏加载函数。

### C. Account views（13 项新增回归）

1. 旧收藏夹首屏覆盖新收藏夹；增加切换代数并重置筛选/opening。
2. 收藏内容、关注、订阅的旧分页覆盖/追加到刷新后的首屏；刷新/卸载使分页失效，刷新重置分页锁。
3. 已加载内容本地筛选无匹配时，加载更多按钮一并消失；三种视图在无匹配分支仍保留分页入口。
4. 关注/订阅加载更多遇到网络失败，整个已加载列表被错误页替换；保留已加载页并显示可重试反馈。明确 signedOut/expired 仍切换到登录错误态。
5. 同一分页响应含重复条目时，去重集合只包含之前页面，造成重复 React key/条目；接受一个新键时立即加入集合。
6. 收藏视频 lookup 在离开视图后走回退导航；加入卸载/刷新代数保护。

### D. Learning / Notes / Statistics（12 项新增回归）

1. 清单的移除、改状态、markOpened、重排返回 false 时静默结束；分别反馈失败，失败移除保留确认，markOpened 失败不打开播放器，重排重新读取顺序并释放忙碌状态。
2. `EntryCard` 每次渲染都创建新组件类型，pointerDown 的 setDragId 立即卸载捕获指针的按钮，移动端拖动因此失去目标；改为无 Hook 的渲染函数，保留节点身份。
3. 笔记删除 false 时提前关闭确认框/详情；失败保留入口和笔记，显示错误，只有成功后关闭详情。
4. 自动补封面的 save(false) 仍把封面写入可见状态；只在服务报告保存成功后更新 UI，后台异常有非阻断反馈。
5. 笔记卡片以及导出格式入口只有鼠标点击；卡片增加自身键盘激活，格式选项使用原生 button。
6. 笔记编辑 onSave rejection 使 saving 一直 true，未保存文本无法继续编辑；catch 展示错误，finally 解锁，保留正文。
7. 笔记来源视频查询在详情卸载后继续调用导航；加入挂载生命周期检查。
8. 统计页 `HistoryPane`/`RecordFilters` 定义在父组件内，每输入一字重建输入节点并丢焦点；改为无 Hook 渲染函数，保留输入节点。没有更改共享 overlay 代码。

## 4. RED / GREEN 证据

全部命令在仓库根目录的 PowerShell 执行，使用已安装的 Vitest 3.2.7；没有改测试环境配置。RED 的输出过滤只是避免重复打印大段 DOM，保留原 Vitest 退出码，不屏蔽失败。

### 4.1 Search

RED 最初为 10 failed / 8 passed；补上删除失败用例后，下列命令为 **11 failed / 8 passed，exit 1，32.08s**：

```powershell
$env:DEBUG_PRINT_LIMIT = '0'; npm test -- src/features/bilibili/BilibiliSearchView.test.tsx --maxWorkers=1 --reporter=dot 2>&1 | Select-String -Pattern 'FAIL |Error:|Tests |Test Files|Duration|Expected:|Received:'; exit $LASTEXITCODE
```

断言分别见旧候选仍在 DOM、清空后 loading 不退、键盘导航不发生、卸载后 view 被改回播放器、remove 未使用 persisted ID、反馈缺失、新词 page 2 请求没有发生。

GREEN：**19 passed，exit 0，4.24s**。

```powershell
npm test -- src/features/bilibili/BilibiliSearchView.test.tsx --maxWorkers=1 --reporter=dot
```

### 4.2 Creator / Collection

第一次新增测试的宽泛按钮名称匹配同时命中了视频行和内层按钮；先把查询改成精确名称，再运行有效 RED。没有以选择器错误作为功能缺陷证据。

有效 RED：**10 failed / 4 passed，exit 1，10.25s**。

```powershell
$env:DEBUG_PRINT_LIMIT = '0'; npm test -- src/features/bilibili/CreatorCollectionViews.test.tsx --maxWorkers=1 --reporter=dot 2>&1 | Select-String -Pattern 'FAIL |Error:|Tests |Test Files|Duration|Expected:|Received:'; exit $LASTEXITCODE
```

GREEN：**14 passed，exit 0，2.21s**。

```powershell
npm test -- src/features/bilibili/CreatorCollectionViews.test.tsx --maxWorkers=1 --reporter=dot
```

### 4.3 Account

RED：**13 failed，exit 1，14.04s**；覆盖三类分页视图以及收藏夹切换/异步导航。

```powershell
$env:DEBUG_PRINT_LIMIT = '0'; npm test -- src/features/bilibili/BilibiliAccountViews.race.test.tsx --maxWorkers=1 --reporter=dot 2>&1 | Select-String -Pattern 'FAIL |Error:|Tests |Test Files|Duration|Expected:|Received:'; exit $LASTEXITCODE
```

GREEN（连同原有账号契约测试）：**2 files / 22 passed，exit 0，3.62s**。

```powershell
npm test -- src/features/bilibili/BilibiliAccountViews.test.tsx src/features/bilibili/BilibiliAccountViews.race.test.tsx --maxWorkers=1 --reporter=dot
```

### 4.4 清单 / 笔记 / 统计输入

RED：**4 files failed，12 failed / 13 passed，exit 1，34.90s**。另有 1 个预期暴露的未处理 rejection（笔记保存抛出“存储失败”）；GREEN 已消除。

```powershell
$env:DEBUG_PRINT_LIMIT = '0'; npm test -- src/features/bilibili/LearningListView.test.tsx src/features/bilibili/VideoNotesView.test.tsx src/features/bilibili/VideoNoteDetailDialog.test.tsx src/features/bilibili/FocusStatisticsView.test.tsx --maxWorkers=1 --reporter=dot 2>&1 | Select-String -Pattern 'FAIL |Error:|Tests |Test Files|Duration|Expected:|Received:|Unhandled'; exit $LASTEXITCODE
```

GREEN：**4 files / 25 passed，exit 0，6.90s**。

```powershell
npm test -- src/features/bilibili/LearningListView.test.tsx src/features/bilibili/VideoNotesView.test.tsx src/features/bilibili/VideoNoteDetailDialog.test.tsx src/features/bilibili/FocusStatisticsView.test.tsx --maxWorkers=1 --reporter=dot
```

最后将重排错误文案改为不提前声称“已重新读取”之后，再跑：**1 file / 7 passed，exit 0，2.33s**。

```powershell
npm test -- src/features/bilibili/LearningListView.test.tsx --maxWorkers=1 --reporter=dot
```

### 4.5 最终有界回归与类型检查

下列回归结果：**15 files / 114 passed，exit 0，26.95s**（2026-09-06 06:33 的工作区快照）。

```powershell
npm test -- src/features/bilibili/BilibiliSearchView.test.tsx src/features/bilibili/CreatorCollectionViews.test.tsx src/features/bilibili/BilibiliAccountViews.test.tsx src/features/bilibili/BilibiliAccountViews.race.test.tsx src/features/bilibili/LearningListView.test.tsx src/features/bilibili/VideoNotesView.test.tsx src/features/bilibili/VideoNoteDetailDialog.test.tsx src/features/bilibili/HomeFeedView.test.tsx src/features/bilibili/FocusDashboard.test.tsx src/features/bilibili/FocusStatisticsView.test.tsx src/features/bilibili/FocusDialogs.test.tsx src/features/bilibili/ProfileHub.test.tsx src/features/bilibili/PersonalizationSettingsView.test.tsx src/features/bilibili/SystemPages.test.tsx src/features/bilibili/LoginView.test.tsx --maxWorkers=1 --reporter=dot
```

测试诊断输出没有伪装成全净：

- `FocusStatisticsView.test.tsx` 有 jsdom 缺少 canvas getContext 实现的提示；本轮没有验证真实趋势图渲染。
- 未修改的 `SystemPages.test.tsx` 有 React act 包装警告；本轮没有为了“净输出”去改变无关测试。
- 最终回归没有未处理 Promise rejection 计数。

```powershell
npm run typecheck
```

第一次类型检查 exit 2：主线程并行修改的 `src/lib/overlayFocus.test.tsx:80` 出现 TS2741（Modal 测试缺少 required children）。已向主线程报告，未越界修改。主线程继续修复后，**06:40 再次执行同一命令 exit 0，没有 TypeScript 错误**。

最终 `git diff --check` 范围为本节第 5 部分的本轮文件；Windows 的 LF/CRLF 提示不等于 diff whitespace 错误。没有运行 commit/push。

## 5. 本轮全部改动路径

```text
src/features/bilibili/BilibiliAccountViews.tsx
src/features/bilibili/BilibiliAccountViews.race.test.tsx  [新增]
src/features/bilibili/BilibiliSearchView.tsx
src/features/bilibili/BilibiliSearchView.test.tsx
src/features/bilibili/CreatorCollectionViews.tsx
src/features/bilibili/CreatorCollectionViews.test.tsx
src/features/bilibili/LearningListView.tsx
src/features/bilibili/LearningListView.test.tsx
src/features/bilibili/VideoNotesView.tsx
src/features/bilibili/VideoNotesView.test.tsx
src/features/bilibili/VideoNoteDetailDialog.tsx
src/features/bilibili/VideoNoteDetailDialog.test.tsx
src/features/bilibili/FocusStatisticsView.tsx
src/features/bilibili/FocusStatisticsView.test.tsx
docs/FEATURE_VIEWS_AUDIT_2026-09-06.md  [新增]
```

## 6. 剩余风险与交接

以下是源码阅读得到的后续检查点，**本轮没有为它们完成 RED/GREEN，不把它们算作已修复或已动态证实的问题**。遵循主线程“有界收尾”要求，不扩展服务/store/原生写范围。

1. **共享 focus 持久化返回契约**：`FocusStatisticsView.tsx:602` 的 deleteHistoryEntry、`:625` 的 clearHistory 仍 fire-and-forget，后者立刻显示清空成功。主线程需确认 `useFocusTimer` 是否真实返回成功/失败，而不是吞掉 false/返回 void；再由视图 await 结果决定关闭确认和成功反馈。`FocusDashboard.tsx:651` 的 markOpened 以及 `FocusDialogs.tsx:107` 的 handleExtend 等类似分支也未完成失败测试。没有修改受保护的 hook。
2. **播放器子浮层新 ref 接口**：`PlayerChapterPanel.tsx`、`PlayerCollectionSheet.tsx`、`PlayerFocusSheet.tsx`、`PlayerPartSelector.tsx` 本轮未逐行读取、未改动、未测试。主线程已提供 `useOverlayInteraction<HTMLDivElement>` 返回 ref 的契约；这些组件可后续在主 dialog 节点接 ref、tabIndex=-1、aria-modal 并验证 trap/恢复。本轮没有把主线程的共享 overlay 18 项测试算进 114 项。
3. **Profile / Login 的异步身份补全**：`ProfileHub.tsx:69` 的 loadAccount 在 await 后仍会调用 `auth.signIn`，其生命周期/会话身份比对需进一步测试；`LoginView.tsx:81` 后的资料补全也应覆盖退出/切换账号与旧资料请求交错。不要用真实凭据或真人写接口复现。
4. **统计的日期与错误范围**：`FocusStatisticsView.tsx:247` 仍以固定 86400000ms 推算近 7/30 天记录范围；趋势日期标签、本地时区/DST、跨午夜、Canvas 缩放/颜色未做运行验证。不要把主线程修复日历/DST 的测试当成此视图已覆盖。
5. **系统页异常与真实能力**：`SystemPages.tsx:116` 的 clipboard 拒绝、Android 权限 API 拒绝、缓存/诊断清理失败尚未测试；`:320` 的未来提醒能力仅从通知权限推断，需与实际原生调度能力对齐，不可用 UI 文案代替设备验证。
6. **个性化失败回滚**：`PersonalizationSettingsView.tsx:69` 在保存前乐观应用偏好，失败只提示、不回滚；更新开关的存储失败也未覆盖。主题本身由主线程负责，本轮没有改主题/store。
7. **发现页与搜索剩余路径**：HomeFeed 切换关键词失败时可能仍展示旧结果，而标签已是新关键词；清除历史的 false 结果也未覆盖。Search 的分页 catch 仍保留列表但缺少失败提示；筛选面板关闭/应用与后续分页的一致性、键盘分页入口尚未动态验证。
8. **视图以外的写队列原子性**：相关本地服务在入队前读取快照，多组件/多实例并发写笔记和清单是否丢更新需要服务层测试；本轮视图 false 检查不代表全局事务性已解决。
9. **设备与交互限制**：未开启真实浏览器/移动端。拖动修复证明捕获目标 DOM 不再被 React 卸载，不等价于所有指针移动、取消、跨多条重排算法都已测过。原始笔记详情/分享/导出浮层的全键盘 trap、截图缩放和本机文件分享也不在本轮验证结论中。

## 7. 未逐行阅读的目录源码

除明确分配给其他 worker 的 `BilibiliPlayerView.tsx`、`useFocusTimer.ts` 和只读契约检查过的 `m3.tsx` 外，以下源码未被本轮逐行审阅，其邻接测试也没有包含在本轮最终 15 文件命令中：

```text
AboutView.tsx
AppUpdateContext.tsx
BilibiliPlayerCoordinator.tsx
FirstLaunchGate.tsx
FocusOnboardingGuides.tsx
FocusSharePreview.tsx
InteractiveVideoChoiceOverlay.tsx
LocalWatchHistoryView.tsx
PlaybackCompletionOverlay.tsx
PlayerChapterPanel.tsx
PlayerChapterStrip.tsx
PlayerCollectionSheet.tsx
PlayerFocusSheet.tsx
PlayerPartSelector.tsx
RixiaWorkspacePage.tsx
VideoNoteSharePreview.tsx
```

上述清单只说明本轮证据边界，不说明其他 worker 没有审阅。后续由主线程独立复审本轮 diff，并在所有并行修改合拢后运行全量验证。
