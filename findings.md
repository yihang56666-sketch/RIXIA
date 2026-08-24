# Findings: FocuBili → RIXIA 差距审计

## 核心结论(2026-08-20)
之前 40+ 个提交声称"1:1 port",但实际行数比只有原版的 10-40%。
UI 层大量细节(布局层级、样式、动画、交互)被压缩丢弃。这是"复刻不出效果"的根因。

## 行数对比矩阵(FocuBili dart → RIXIA tsx)
| FocuBili 文件 | 行数 | RIXIA 对应 | 行数 | 比例 |
|---|---|---|---|---|
| search_page.dart | 2080 | BilibiliSearchView.tsx | 426 | 20% |
| user_profile_page.dart | 1453 | CreatorCollectionViews.tsx | 736 | 51%（2026-08-20 深挖：可折叠头/排序菜单/搜索/滚动翻页/分P补查已还原） |
| focus_dashboard.dart | 1192 | FocusDashboard.tsx | 381 | 32% |
| focus_statistics_page.dart | 1026 | FocusStatisticsView.tsx | 222 | 22% |
| video_note_detail_page.dart | 785 | VideoNoteDetailDialog.tsx | 184 | 23%（2026-08-20 深挖：未保存拦截/全屏截图浏览/二次确认已还原） |
| video_notes_page.dart | 738 | VideoNotesView.tsx | 190 | 26% |
| personalization_settings_page.dart | 743 | SystemPages.tsx(含3页) | 269 | 36% |
| focus_timer_controller.dart | 753 | useFocusTimer.ts | 458 | 61% |
| login_page.dart | 779 | BilibiliAccountViews.tsx(含多页) | 368 | 47% |
| video_note_composer.dart | 675 | VideoNoteComposer.tsx | 255 | 38% |
| learning_list_page.dart | 624 | LearningListView.tsx | 215 | 34% |
| profile_page.dart | 616 | ProfileHub.tsx | 111 | 18% |
| watch_history_page.dart | 589 | LocalWatchHistoryView.tsx | 232 | 39%（2026-08-20 深挖：五态分离/缩略图补齐/二次确认对话框已还原） |
| home_page.dart | 316 | HomeFeedView.tsx | 115 | 36% |
| first_launch_gate.dart | 246 | FirstLaunchGate.tsx | 78 | 32% |
| player 全家桶 (16文件) | ~8600 | BilibiliPlayerView.tsx | 1427 | 17% |
| focus 弹窗群 (7文件) | ~2100 | FocusDialogs.tsx | 248+59 | 15% |
| main_shell.dart | 291 | Shell.tsx(全局shell) | 102 | — |

FocuBili features 层总计 ~31,000 行 dart; RIXIA bilibili UI 层 ~6,900 行 tsx。

## FocuBili 设计系统 (app_theme.dart)
- 品牌色: #1677FF (Material 3 seedColor)
- Card: elevation 0, 圆角 20, surfaceContainerHighest 45% 透明填充
- 输入框: filled, 18px 圆角, 无边框
- NavigationBar: 高 72, indicator 圆角 16
- Material 3 ColorScheme.fromSeed
- 浅色/深色双主题, 跟随系统模式 (AppThemeModeController)

## FocuBili 路由 (app_router.dart)
home, player, login, cacheManagement(/settings/cache), about(/settings/about),
problemDiagnostics, systemCapabilities(/settings/permissions), personalizationSettings,
watchHistory(/history), videoNotes(/notes), focusStatistics(/focus/statistics)
→ RIXIA VIEW_TITLES 已覆盖全部对应 view key (catalog.ts:27-63)

## FocuBili 应用形态
- v1.1.1+: 首页无底部导航 — 首屏搜索按钮 + 右上角个人图标进入"我的"
- 首页可扩展卡片,上滑吸附展开,带下坠/模糊/透明过渡动画
- 主动搜索为主,无推荐流
- Windows + Android 双平台
- v1.4.x: Windows 完整客户端、Toast、剪贴板链接监听

## RIXIA 形态
- 自有 Shell (today/plan/library/focus/settings 五视图 + 工具)
- bilibili 是其中一个工具域 ("videos" 看课)
- 主题系统是自己的 11 个皮肤,与 FocuBili Material3 不同



## 更新（2026-08-20 继续）
| favorite_folders_page.dart | 402 | BilibiliFavoritesView（BilibiliAccountViews.tsx 内） | ~180 | 45%（本会话：搜索/八态状态/角标已还原） |
| favorite_videos_page.dart | 481 | FavoriteVideosView（BilibiliAccountViews.tsx 内，新增独立视图） | ~150 | 31%（本会话：新增，此前完全没有独立收藏夹内容页） |
| followed_creators_page.dart | 449 | BilibiliFollowedView | ~90 | 20%（本会话：UID/认证/签名信息层级、本地搜索已还原） |
| subscribed_collections_page.dart | 405 | BilibiliSubscribedCollectionsView | ~90 | 22%（本会话：合集卡片格式、ownerMid 校验已还原） |

### 根因修正记录（2026-08-20）
FocuBili 的 `BilibiliAccountDataService` 只有 4 个只读方法（收藏夹/收藏内容/关注/订阅），没有服务器端观看历史。
RIXIA 历史实现里错误地新增了一个 `listWatchHistory` 调用 `x/v2/history`（FocuBili 源码中不存在），且"我的"页
"观看记录"入口错误指向了这个虚构视图而非已忠实移植的本机 `LocalWatchHistoryView`。已在本会话连根修正。

### 更新（2026-08-20 继续 3）
| login_page.dart（含 _OfficialQrLoginPage） | 733 | LoginView.tsx | ~300 | 41%（本会话：扫码登录状态机、切换账号自动
  触发官方登录已还原；仍缺：网页登录 WebView 分支在 Web 平台无对应物，密码登录维持"待开发"占位与 Dart 一致） |

### 根因修正记录追加（2026-08-20 继续 3）
`createBilibiliQrLoginService`（passport 扫码生成/轮询）此前已在 `accountService.ts` 完整移植，但从未被任何 UI 组件
调用——旧版 `LoginView.tsx` 只有"打开官方网页新标签 + 手动粘贴 Cookie"，完全没有对齐 FocuBili Windows 平台
`LoginExperience.officialQrCode` 的扫码登录体验。已重写 `LoginView.tsx` 接入该服务。
同时发现 `ProfileHub.openLogin(openOfficialOnStart)` 把参数用 `void openOfficialOnStart;` 直接丢弃，"切换账号"/
"重新登录"点击后无法对齐 Dart `LoginPage(openOfficialLoginOnStart: true)` 首帧自动打开官方登录的行为，已修复。

### 根因修正记录追加（2026-08-20 继续 4）
FocuBili 源码没有独立的"应用更新"路由——`about_page.dart` 内嵌完整更新卡片，并通过全应用共享的
`AppUpdateController`（`InheritedNotifier` + `AppUpdateScope`）让启动提示、"我的"页设置红点、关于页三处
共享同一份状态。RIXIA 此前有三份互相独立、逻辑不一致的更新检查代码（`App.tsx` 内联 state、`SystemPages.tsx`
独立 `useAppUpdateCheck`/`AppUpdatePage`、`AboutView.tsx` 完全没有更新卡片），且 `PersonalizationSettingsView`
"启动时检查更新"开关使用了与实际检查逻辑完全不同的 localStorage key，导致关闭开关不生效。已统一为共享
`AppUpdateContext` + 单一 `appUpdatePreferences.ts` 存储源，并删除多余的 `app-update` 路由。

### 深挖评估结论（2026-08-20 继续 4）
逐项核实了 findings.md 行数比例最低的几个模块（播放器 17%、专注弹窗 15%、搜索 20%、系统页 16%）后确认：
播放器手势（长按 3 倍速、双击 seek、scrub 预览帧）、专注统计筛选排序、B站搜索双模式/分集补查等核心功能
均已完整实现，行数比例低主要因为 Dart 源码把职责拆分为大量独立协调器类（样板代码/超详细中文注释占比高），
TS 版用 hooks 合并实现了等效功能。行数比例矩阵不能直接作为功能缺失的证据，需逐项对照源码验证。

### 死代码/未接线组件系统性排查（2026-08-20 继续 5）
用脚本扫描全部 `export function` 组件与 `create*` 服务工厂在整个代码库的引用次数，排查是否还有类似
`VideoNoteComposer` 这样"完整实现但从未被使用"的情况。结果：
- `VideoNoteComposer.tsx` — 已修复（见上）
- `createAppThemeModeService`（focusServices.ts）— 真正死代码，RIXIA 暗色模式已通过 `useAppStore` 主题系统
  正确实现，此服务是被绕过的早期实现，不影响功能，未处理
- `createEmptyPlayerEnhancementService` / `createEmptyVideoShotService` — 有意提供的空对象模式测试替身，
  非功能缺陷
- `createFocusSessionService`（services.ts）— 真正死代码，`useFocusTimer.ts` 有自己独立且已正确接线的
  持久化逻辑（`focusSessionModel.ts`），此服务是被绕过的早期实现，未处理
- `attachDeepLinkHandler` / `registerProtocolHandler`（deepLinkService.ts）— RIXIA 原创的 Web
  `web+bilibili:` 协议注册与 hash 路由方案，FocuBili 源码中不存在对应功能（Flutter 应用没有浏览器协议注册
  概念），不属于复刻范围，未处理
结论：本次排查未发现除 `VideoNoteComposer` 外其他"建好未接线"的重大功能缺陷。
