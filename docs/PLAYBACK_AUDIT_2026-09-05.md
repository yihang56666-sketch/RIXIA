# B 站服务与 Web 播放链有界审计 — 2026-09-05

实际审阅与验证延续至 2026-09-06（Asia/Shanghai）。仓库：<repo-root>。本文中的代码路径均相对该仓库根目录。

## 1. 范围与交接结论

- 写范围限定为 src/lib/bilibili/、BilibiliPlayerView.tsx 及其测试，以及本文。实际仅修改下列五组服务/测试和新增本文，没有修改 Player、App.tsx、useFocusTimer、store、其他 features、Android、Electron 或 scripts。
- 保留现有架构；先读取完整实现和相关测试，再对证实的问题补失败回归、执行 RED、最小根因修复、执行 GREEN。没有通过重构扩大工作。
- 已全读 35 份既有范围内文件（19 份 lib 实现、14 份邻接测试、2 份 Player 文件）；另完整编写并核验 1 份新增 deepLinkService.test.ts。45 份既有范围内文件未读，逐份列在第 7 节。执行某文件的测试不等于审阅其源码。
- 最后按主线程要求优先完成 nativeShareIntent 生命周期修复并停止扩展审阅。本文是有界交接，不是整个 lib/bilibili 或播放器“无 bug”的证明；未复现候选不计入已确认修复。
- 恢复任务时核对了权威 git status / scoped git diff，保留全部其他 agent 变更。未 commit、push、创建分支，未修改用户凭据，未操作硬件或启动常驻浏览器，未向网络发送私密数据。

## 2. 优先交付：nativeShareIntent 生命周期

文件：src/lib/bilibili/nativeShareIntent.ts:22；测试：src/lib/bilibili/nativeShareIntent.test.ts。

接口为向后兼容的可选第三参数：

```typescript
export async function attachNativeShareIntent(
  plugin: NativeShareIntentPlugin,
  onShare: (text: string) => void,
  signal?: AbortSignal,
): Promise<() => Promise<void>>
```

上方接口的原始声明以源码为准。行为契约如下：

1. 已 aborted 的 signal：以 name 为 AbortError 的 DOMException 拒绝，不调用 addListener。
2. addListener 或 getPendingText 尚未完成时 abort：attachment promise 立即以 AbortError 拒绝，不等待这些原生 promise；同步停止对 onShare 的事件/结果投递。
3. 已取得 listener 时触发清理；注册结果晚到时仍 remove，且不再查询 pending text。
4. getPendingText 拒绝时先清理已注册 listener，再传播原始错误；初始化与清理都失败时传播 AggregateError，errors 保留两项原因。
5. detach 幂等，同一 listener 的 remove 至多调用一次；detach/abort 后的原生事件与迟到 pending 结果不再触发 onShare。
6. abort 或迟到注册引发的异步清理失败已有 rejection handler，并通过 console.error("原生分享监听清理失败", error) 报告。显式 await detach() 仍可收到 remove 的拒绝。
7. 保留原有冷启动去重语义：注册期间先收到 retained event 时不再投递 pending text；未改成按文本跨生命周期去重。

已确认的旧行为及 RED 观测：

| 条件 | 修复前可观察结果 |
| --- | --- |
| listener 已注册，getPendingText 拒绝 | remove 调用 0 次，遗留 listener |
| pending 查询挂起后 abort | remove 仍为 0，attachment 无法及时取消 |
| 注册挂起时 abort，listener 随后返回 | listener 不被移除 |
| 入参 signal 已 aborted | 仍注册并返回 disposer，而非拒绝 |
| 并发调用两次 disposer | remove 调用 2 次，且没有 stopped 投递保护 |
| abort 清理的 remove 拒绝 | 没有错误报告处理路径 |

首轮 nativeShareIntent RED 为 6 failed / 3 passed，退出码 1；同一轮 GREEN 为 9 passed，退出码 0。三个已通过用例包含既有冷启动/热启动行为及新增 retained-event 去重兼容验证。

之后追加两项清理错误验证：初始化与清理错误同时保留、迟到 listener 清理失败被报告；最终 helper 11 项全部通过。这两项是修复后的追加验证，不冒称具有单独的 RED 记录。

App 集成精确要求：传入第三参 controller.signal；卸载/所有权结束时 abort；保留正常返回的异步 disposer，并观察 setup/cleanup rejection。AbortError 表示预期取消；其他错误或 AggregateError 不应假装成功。主线程已接手并报告 App.tsx 的 ownership/diagnostics 集成，App.native.test 的结果不计入本报告，本 agent 没有编辑或复核 App。

## 3. 其他已确认修复

### 3.1 publicContentService：负业务码被当成成功

- 条件：视频搜索或用户搜索返回 code=-352；视频详情返回 code=-404。
- 根因：三个响应边界使用了会把负数归零的 readInteger；搜索错误因此变成成功空列表，视频详情则丢失真实业务码和消息。
- 修复：仅在三个业务码边界复用 readSignedInteger，保留 BilibiliLookupError 及现有公开接口。
- RED：2 项搜索本应拒绝却返回空 results；详情本应保留 -404 消息却抛“接口没有返回视频详情”。3 failed / 24 passed。
- GREEN：27 passed。没有据此声称所有缺失/畸形响应字段均已验证。

### 3.2 httpAdapter：Cookie 信任边界、代理 host 与响应头大小写

- 条件：本地存在模拟登录 Cookie，原生 JSON 请求目标为第三方字幕地址或 api.bilibili.com.example.test。
- 根因：原生 JSON 请求无目标限制地附加 Cookie；浏览器代理使用 startsWith 判断 API host，近似 host 被转换为 /bili-api.example.test/...；原生响应头只按给定 key/lowercase key 查询，漏读 Set-Cookie。
- 修复：仅精确 HTTPS api.bilibili.com origin 且无 URL 用户名/密码时附加会话 Cookie；代理使用 URL 解析后的精确 origin；响应头名比较不区分大小写。
- RED：2 项 Cookie 不应存在但实际存在；近似 host 被错误代理；Set-Cookie 返回 null。4 failed / 7 passed。
- GREEN：11 passed。所有 Cookie 均为本地测试字符串，没有使用真实已登录账户。
- 边界：此修复约束的是 JSON adapter 的初始请求；没有证明跨 host 重定向策略，也没有覆盖 nativeMediaHeaders/native 媒体请求的 Cookie 策略。

### 3.3 accountService：二维码畸形响应与迟到 nav 覆盖会话

- 条件 A：QR poll 顶层成功但 data.code 缺失。原实现 readInteger 将缺失值解释为 0，结果错误返回 confirmed。
- 修复 A：要求 data.code 是整数 number，否则抛扫码登录状态码错误。
- 条件 B：当前账号缺少 mid，补拉 nav 尚未返回时退出登录或切换账号。旧 nav 返回后调用 signIn，恢复已退出会话或用旧 profile 覆盖新账号。
- 修复 B：记录请求时 Cookie；await 后重新核对 signedIn、Cookie 与 mid，旧响应不能写回，后续账号查询也不继续。
- 条件 C：补 mid 的 nav 返回 -101。旧路径将其降为 unavailable，丢失 expired 分类。
- 修复 C：复用现有 classifyCurrentUserResponse。
- RED：缺 code 被确认为登录、退出后重新 signedIn、切换后 mid 被旧账号覆盖、expired 被降为 unavailable。4 failed / 12 passed。
- GREEN：16 passed。未声称所有其他账号请求已有全局取消/代际隔离。

### 3.4 deepLinkService：无效转义与分集参数消费

- 条件：搜索 URL/hash 含不完整 UTF-8 百分号转义；URL keyword 使用加号；CID 超过安全整数范围或分集为 0；内部 video hash 含无效 BV。
- 根因：decodeURIComponent 直接抛异常；未转换 query 的加号；标识符只做 parseInt；hash BV 未验证。
- 修复：安全解码，非法搜索输入不投递；加号按 query 空格解释；CID/page 与已提取 MID 检查正安全整数；内部 video hash 要求完整 BV 格式。
- RED：2 项 URI malformed，1 项加号解码错误，1 项接受非法分集标识符。4 failed。
- GREEN：4 passed。没有重写全部分享文本解析，也未证明所有 host、MID 后缀或恶意字符串组合均被拒绝。

## 4. 实际验证命令与结果

所有命令的工作目录均为 <repo-root>。PowerShell 的 npm 包装脚本曾在启动测试前因 <nodejs>\npm.ps1 的 LASTEXITCODE 未定义而失败；这不是 RED。后续直接使用已经安装的 Node 和仓库 CLI，没有安装依赖。以下为实际 argv 对应的 PowerShell 复现命令：

```powershell
$Node = '<user-dir>\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $Node node_modules/vitest/vitest.mjs run src/lib/bilibili/publicContentService.test.ts --maxWorkers=2
& $Node node_modules/vitest/vitest.mjs run src/lib/bilibili/httpAdapter.test.ts --maxWorkers=2
& $Node node_modules/vitest/vitest.mjs run src/lib/bilibili/accountService.test.ts --maxWorkers=2
& $Node node_modules/vitest/vitest.mjs run src/lib/bilibili/deepLinkService.test.ts --maxWorkers=2
& $Node node_modules/vitest/vitest.mjs run src/lib/bilibili/nativeShareIntent.test.ts --maxWorkers=2
```

| 单文件命令 | RED（2026-09-06） | GREEN（2026-09-06） |
| --- | --- | --- |
| publicContentService.test.ts | 03:23:10；exit 1；3 failed / 24 passed | 03:23:31；exit 0；27 passed |
| httpAdapter.test.ts | 04:16:45；exit 1；4 failed / 7 passed | 04:17:28；exit 0；11 passed |
| accountService.test.ts | 04:18:23；exit 1；4 failed / 12 passed | 04:18:46；exit 0；16 passed |
| deepLinkService.test.ts | 04:34:43；exit 1；4 failed | 04:35:25；exit 0；4 passed |
| nativeShareIntent.test.ts | 04:38:05；exit 1；6 failed / 3 passed | 04:44:03；exit 0；9 passed；追加错误清理验证后为 11 passed |

最终 targeted / 有界回归 / 类型检查命令：

```powershell
& $Node node_modules/vitest/vitest.mjs run src/lib/bilibili/publicContentService.test.ts src/lib/bilibili/httpAdapter.test.ts src/lib/bilibili/accountService.test.ts src/lib/bilibili/deepLinkService.test.ts src/lib/bilibili/nativeShareIntent.test.ts --maxWorkers=2
& $Node node_modules/vitest/vitest.mjs run src/lib/bilibili src/features/bilibili/BilibiliPlayerView.test.tsx --maxWorkers=2
& $Node node_modules/typescript/bin/tsc --noEmit
git diff --check -- src/lib/bilibili src/features/bilibili/BilibiliPlayerView.tsx src/features/bilibili/BilibiliPlayerView.test.tsx docs/PLAYBACK_AUDIT_2026-09-05.md
```

| 检查 | 已收取的准确结果 |
| --- | --- |
| 修改前有界基线（上述目录 + Player 命令） | exit 0；37 test files，222 tests passed；27.35s |
| 修复后五文件 targeted | 04:57:11；exit 0；5 files，69 tests passed；4.03s；stderr 为空 |
| 恢复任务后刷新五文件 targeted | 05:15:55；exit 0；5 files，69 tests passed；4.27s；stderr 为空 |
| 修复后 lib/bilibili + Player 有界回归 | 04:57:16；exit 0；38 files，246 tests passed；28.74s |
| 类型检查（恢复任务后刷新） | exit 0；stdout/stderr 均为空 |
| 已执行 scoped git diff --check | exit 0；没有空白错误；Git 另有现有 LF→CRLF 提示 |

重要限制：

- Vitest 路径采用子串过滤，因此目录命令还执行了 src/lib/bilibili.test.ts（5 tests）；该范围外文件未读、未审计、未改动。
- Player 的 42 项测试在修复后回归中全部通过，但 stderr 仍有 jsdom 缺少 canvas getContext 实现和 React act(...) 警告；基线也存在这两类警告。本报告不称运行“零警告”。
- 运行的目录回归包含第 7 节若干未读测试；通过仅表示执行结果，不提升审阅覆盖率。
- 这些命令对应执行当时共享工作树，不是主线程随后 App/persistence/date 修改后的全量认证。主线程最后要求不再并跑大 suite，已停止扩展验证；集成全量由主线程负责。
- 未运行真实浏览器/MSE、真实原生设备、线上 B 站/媒体 CDN 或真实账户 API。未发真实账户写 API；本文业务码、Cookie、异步桥接测试均使用本地 fake transport/platform。

## 5. 跨层精确接口与尚缺证据

### 5.1 提供给主线程的契约（未修改）

- src/lib/bilibili/services.ts:86 的 PlaybackPreferencesService.save(preferences) 返回 Promise<boolean>。src/lib/bilibili/services.ts:105 中 storage.setItem 异常返回 false，JSON.stringify 在 catch 外，序列化异常会拒绝。调用端仅 await 而不检查结果不能证明保存成功。Settings 的 false/rejection 反馈由主线程修复；此处没有更改契约、Settings 或存储 key。
- src/lib/bilibili/focusServices.ts:26 的 loadState(): Promise<FocusStoredState> 与 saveState(activeSession, history): Promise<boolean> 保持原样。
- src/lib/bilibili/focusServices.ts:17 的 ACTIVE_KEY=rixia_focus_active_session、HISTORY_KEY=rixia_focus_history 均未改动。主线程负责 companionBackup 恢复事件与 useFocusTimer singleton 重载，本文不重复该修复。

### 5.2 已读源码中的待复验候选（无 RED，未修复）

以下是交接线索，不是已复现缺陷；需要主线程/对抗复审针对当前整合版本建立独立回归。

| 文件/路径 | 需要验证的条件与缺口 |
| --- | --- |
| services.ts 的 read-modify-write 保存路径 | 快照在队列执行前读取；两个并发保存是否丢失较早更新，需要并发实际存储回归。 |
| services.ts 的 notes/history/learning-list 消费边界 | 部分读取只检查最少 id/BV 字段，后续 localeCompare/UI 消费要求更多字段。需结合主线程最新备份导入校验验证畸形 payload 是否仍可达，不能把“导入已校验”当作消费端证明。 |
| focusServices.ts:73 | 两个 key 先写 active 再写 history，后者失败时是否留下部分更新，需要故障注入回归与恢复语义决策。 |
| focusSessionModel.ts | 反序列化的日期、时长与日桶数值是否允许异常值，需畸形备份样本和行为断言。 |
| focusStatisticsModel.ts | UTC 日期解析、本地日期桶和固定 24h 步长的时区/DST 边界；主线程日期修复整合后仍需对应证据。 |
| dashPlayer.ts:187 / :208 / :325 / :590 | destroy 时等待 sourceopen/firstChunk 的 promise、空流/无 moof、EOF 与 finishStream 调用顺序、首块 promise 早于 append 完成等候选；现有 9 项 range-seeking 测试没有建立这些终态回归。 |
| BilibiliPlayerView.tsx 的恢复 effect（约 320–350、497–510） | watch-history fallback 是否绕过 resumeFromLastPosition=false；需要真实组件断言，未修复。 |
| BilibiliPlayerView.tsx 的跨分集笔记跳转（约 1245） | 切换 source 前向旧播放器 seek，随后恢复 effect 是否覆盖目标；需延迟加载/换集竞态回归。 |
| BilibiliPlayerView.tsx:1343 / :1415 | 笔记 save/remove 返回 false 时 UI 是否错误表示成功；布尔值被忽略的静态线索未作用户可见失败回归。 |
| BilibiliPlayerView.tsx 的 native/Web fallback 与 nativeMediaPlayer.ts | 晚到 listener/open/close 与卸载的异步所有权是否存在竞态；没有真实 native 验证，也没有把 nativeShareIntent 的结论推广到媒体播放。 |
| nativeMediaHeaders.ts | 媒体 Cookie 构造没有目标 host 参数；JSON adapter 修复不能代替媒体 host/redirect 边界验证。Native worker 也提供了相关线索，需在合法媒体域名策略与实际调用可达性下单独复现。 |

## 6. 精确已读清单

“全读”指逐段完整读取第一方源码/测试，不是仅 grep；大文件连续分段读取。修复文件还核对了最终 diff。清单反映本次审阅时版本，不代表其他 agent 之后的改动已经复审。

### 6.1 lib 实现：19 份既有文件，全部完整阅读

| 文件 | 审阅重点/处理 |
| --- | --- |
| src/lib/bilibili/accountService.ts | QR 状态、Cookie/auth、nav 补资料及账号请求；已修复第 3.3 节 |
| src/lib/bilibili/dashPlayer.ts | MSE 管线、range seek、首块/结束状态、销毁；仅提出待复验项 |
| src/lib/bilibili/deepLinkService.ts | 分享文本、搜索解码、分集参数、hash handler；已修复第 3.4 节 |
| src/lib/bilibili/extendedModels.ts | 扩展模型、默认值和服务消费的数据契约 |
| src/lib/bilibili/focusServices.ts | 状态/历史存储、失败结果与公开接口；未改 |
| src/lib/bilibili/focusSessionModel.ts | 会话转换、计时与反序列化；未改 |
| src/lib/bilibili/focusStatisticsModel.ts | 日期桶、统计聚合与时间边界；未改 |
| src/lib/bilibili/httpAdapter.ts | Web/native JSON 请求、代理、Cookie 与响应头；已修复第 3.2 节 |
| src/lib/bilibili/nativeMediaHeaders.ts | 原生媒体请求头；未改，未推广 JSON 修复结论 |
| src/lib/bilibili/nativeMediaPlayer.ts | 原生桥接接口、listener 与 dispose 生命周期；未改 |
| src/lib/bilibili/nativeShareIntent.ts | 冷/热启动投递、异步注册、清理；已修复第 2 节 |
| src/lib/bilibili/playbackProgress.ts | 本地进度与近完成处理；未改 |
| src/lib/bilibili/playbackSourcePolicy.ts | source 选择与 fallback 策略；未改 |
| src/lib/bilibili/playurlService.ts | playurl 请求、错误、流/清晰度解析；未改 |
| src/lib/bilibili/publicContentService.ts | 查询入口、WBI/回退、响应解析；已修复第 3.1 节 |
| src/lib/bilibili/services.ts | 偏好、笔记、历史/列表与保存队列；未改 |
| src/lib/bilibili/types.ts | 公共数据类型、默认值、服务接口 |
| src/lib/bilibili/watchHistoryService.ts | 历史条目读取与内容补充；未改 |
| src/lib/bilibili/wbiSign.ts | WBI 签名构造与输入处理；未改 |

### 6.2 邻接测试：14 份既有文件完整阅读

- src/lib/bilibili/accountService.test.ts
- src/lib/bilibili/dashPlayer.test.ts
- src/lib/bilibili/focusSessionModel.test.ts
- src/lib/bilibili/httpAdapter.test.ts
- src/lib/bilibili/learningListService.test.ts
- src/lib/bilibili/nativeMediaHeaders.test.ts
- src/lib/bilibili/nativeMediaPlayer.test.ts
- src/lib/bilibili/nativeShareIntent.test.ts
- src/lib/bilibili/playbackProgress.test.ts
- src/lib/bilibili/playbackSourcePolicy.test.ts
- src/lib/bilibili/playurlService.test.ts
- src/lib/bilibili/publicContentService.test.ts
- src/lib/bilibili/watchHistoryService.test.ts
- src/lib/bilibili/wbiSign.test.ts

另新增并完整编写/核验：src/lib/bilibili/deepLinkService.test.ts（4 项）；不混入“既有文件已读”计数。

### 6.3 Player：2 份完整阅读，均未修改

- src/features/bilibili/BilibiliPlayerView.tsx：全部实现，含 effect cleanup、source 换集、native/Web fallback、恢复、历史、笔记和 UI；未作重构。
- src/features/bilibili/BilibiliPlayerView.test.tsx：全部 42 项既有测试及 setup；本次未新增 Player 回归，因此候选问题没有被测试全绿“排除”。

### 6.4 相关配置与局部交接资料

完整阅读：package.json、tsconfig.json、vitest.config.ts、vite.config.ts、src/test/setup.ts。

仅局部阅读：docs/NATIVE_AUDIT_2026-09-05.md 的 220–270 行（重点为 231 起的 native sharing 交接），没有声称全读该文档。遵循已提供的 AGENTS 指令；所查写入目录没有额外 AGENTS.md。

## 7. 精确未读清单：45 份既有范围内文件

按最终收束指令停止扩展，不把路径枚举或测试执行列为源码审阅。以下全部未完整阅读、未审计、未修改：

- src/lib/bilibili/appUpdatePreferences.test.ts
- src/lib/bilibili/appUpdatePreferences.ts
- src/lib/bilibili/danmakuFetchService.test.ts
- src/lib/bilibili/danmakuFetchService.ts
- src/lib/bilibili/danmakuRenderer.ts
- src/lib/bilibili/diagnosticsService.test.ts
- src/lib/bilibili/diagnosticsService.ts
- src/lib/bilibili/firstLaunchService.ts
- src/lib/bilibili/focusCompletionPolicy.test.ts
- src/lib/bilibili/focusCompletionPolicy.ts
- src/lib/bilibili/focusPlaybackPolicy.test.ts
- src/lib/bilibili/focusPlaybackPolicy.ts
- src/lib/bilibili/focusShareService.test.ts
- src/lib/bilibili/focusShareService.ts
- src/lib/bilibili/gestureCoordinator.test.ts
- src/lib/bilibili/gestureCoordinator.ts
- src/lib/bilibili/imageUrl.test.ts
- src/lib/bilibili/imageUrl.ts
- src/lib/bilibili/interactivePlaybackPolicy.test.ts
- src/lib/bilibili/interactivePlaybackPolicy.ts
- src/lib/bilibili/mediaCacheService.test.ts
- src/lib/bilibili/mediaCacheService.ts
- src/lib/bilibili/mediaHostPolicy.test.ts
- src/lib/bilibili/mediaHostPolicy.ts
- src/lib/bilibili/mediaSessionService.test.ts
- src/lib/bilibili/mediaSessionService.ts
- src/lib/bilibili/miscServices.test.ts
- src/lib/bilibili/miscServices.ts
- src/lib/bilibili/mp4Boxes.test.ts
- src/lib/bilibili/mp4Boxes.ts
- src/lib/bilibili/nativeDeepLink.test.ts
- src/lib/bilibili/nativeDeepLink.ts
- src/lib/bilibili/playbackCompletionPolicy.test.ts
- src/lib/bilibili/playbackCompletionPolicy.ts
- src/lib/bilibili/playbackControlPolicy.test.ts
- src/lib/bilibili/playbackControlPolicy.ts
- src/lib/bilibili/playerEnhancementService.ts
- src/lib/bilibili/qualityPolicy.test.ts
- src/lib/bilibili/qualityPolicy.ts
- src/lib/bilibili/shareCapture.test.ts
- src/lib/bilibili/shareCapture.ts
- src/lib/bilibili/subtitleService.test.ts
- src/lib/bilibili/subtitleService.ts
- src/lib/bilibili/videoShotService.test.ts
- src/lib/bilibili/videoShotService.ts

## 8. 本 agent 全部修改路径

除以下 11 个路径外没有直接编辑其他项目文件；其中 deepLinkService.test.ts 与本文为新增。

- src/lib/bilibili/accountService.ts
- src/lib/bilibili/accountService.test.ts
- src/lib/bilibili/deepLinkService.ts
- src/lib/bilibili/deepLinkService.test.ts
- src/lib/bilibili/httpAdapter.ts
- src/lib/bilibili/httpAdapter.test.ts
- src/lib/bilibili/nativeShareIntent.ts
- src/lib/bilibili/nativeShareIntent.test.ts
- src/lib/bilibili/publicContentService.ts
- src/lib/bilibili/publicContentService.test.ts
- docs/PLAYBACK_AUDIT_2026-09-05.md

保留事项：主线程负责 Settings false/rejection UI、备份恢复事件、App native intent ownership 及整合后的对抗复审/全量验证。本报告不替其他 agent 认领修复，也不把未读文件或缺少运行证据的候选写成已经修复。
