# 第一方业务视图限定审计 — 2026-09-06

## 结论与边界

- 工作目录：`<repo-root>`；起点 HEAD：`46ff23c`。开始时工作区已有主线程/其他工人的修改，全部保留。
- 仅编辑本文及 `src/features/{countdowns,habits,inbox,library,notes,plan,tasks,today,tools,videos}/` 内源/相邻测试。实际改动为 4 个业务源文件、4 个既有测试、1 个新增相邻测试和本文，完整列表见末尾。
- 未编辑 App、store、lib、共享组件、Bilibili 目录或 native；没有 commit、branch、push、设备操作、远程 agent、第三方写操作，也未发起第三方网络请求。
- 核对了 `<workspace-root>\AGENTS.md`、项目父目录/根目录、`src/`、`src/features/`、`docs/` 以及范围内嵌套 AGENTS：未发现磁盘上的适用文件；遵循用户提供的 ECC 指令。已走 using-superpowers → systematic-debugging → TDD，并使用 error-handling、verification-before-completion。
- 最终：**12 个限定测试文件、87 项测试通过，exit 0**；限定 TypeScript 检查 **25 个入口、0 diagnostics，exit 0**；正常 Git 配置下 scoped `git diff --check` **exit 0**。
- 87 项由原基线 53 项、12 项缺陷回归及 22 项离线审计探针组成。没有跑全仓测试/构建；不是分支覆盖率或每个字符覆盖率声明。
- 收到 transport error 续接通知后，先只读核对在途 Vitest 进程，结果为空；没有遗留本任务的测试进程。之后完成最终有界验证。主线程 Modal/overlayStack 新 API 没有在此改动，最终局部测试/类型检查与其兼容。

## 经 RED → GREEN 修复的缺陷

| 编号 | 根因、复现与最小修复 | 证据 |
| --- | --- | --- |
| V-01 今日页误导航 | 空数据的“创建今日任务 / 开始”进入收集箱；习惯概览/管理及倒计时概览全部进入默认任务 tab。使用已有路由：创建任务进入 plan，习惯进入 habits，倒计时进入 countdowns；不改 App/路由结构。 | TodayView 新增 4 项点击回归先失败：`inbox != plan`、`plan != habits/countdowns`，修改后 12/12 通过。 |
| V-02 跨午夜新增任务日期错误 | TasksView 把渲染时 `today` 捕获进 QuickAdd 回调。23:59 打开、00:00 提交会保存到昨天，并从“今天”列表消失。改为直接调用既有 addTask，让 store 在操作时计算默认日期。 | 固定本地时间从 2026-09-05 23:59:59 到 09-06 00:00:01；RED 得到 09-05，GREEN 得到 09-06 且任务仍在列表。TasksView 8/8 通过。 |
| V-03 间隔习惯连击单位错误 | `frequencyAwareStreak` 对 interval-days 返回的是满足周期的“轮数”，两处视图却标成“天”。仅修正 HabitsView 和 TodayView 的单位；每日/每周与历史最长自然日统计不变。 | 隔日打卡的 3 个周期应显示“3 轮”；Today 待办间隔习惯显示“连续 0 轮”。2 项先 RED，修复后两文件 17/17 通过。 |
| V-04 云资源失败/切换状态不可靠 | 直链 video 没有错误反馈及重新加载入口；iframe 等待没有上限；已加载/失败的旧资源状态会污染同实例内的新资源。新增可恢复 alert、视频重载 key、15 秒 iframe 等待兜底及清理、按 resource id/URL 重置状态，保留手动浏览器入口。删掉“始终在 App 内播放”的不实保证，明确网络/嵌入限制。 | 直链 error、iframe 超时/重试/成功后取消超时、已加载资源切换、同 ID URL 替换、限制说明共 5 项新增回归先 RED，最终 CloudResourceView 7/7 通过。 |

### iframe 验证中的纠正

最初给 iframe 加 `onError` 的尝试没有使测试通过（4 项中仍失败 1 项）。检查当前 React DOM 后确认 iframe 非委托监听的是 load，不是 media 的 error 集合；跨源 iframe 也不能据 load 事件断言页面成功可用。没有通过伪造可冒泡的 error 事件“修绿”测试，而是移除无效处理，改为真实可发生的“始终没有完成加载”计时回归和超时兜底。load 仅结束等待，不代表穿透 CSP/X-Frame-Options；页面空白/登录限制仍需用户使用显式浏览器入口。

## 完整显式阅读清单

以下路径均相对本工作目录。原始 22 个源/测试文件合计 **2,276 行**，按编号分段显式读取；被工具截断的片段另外补读（例如 HabitsView 37–48、CountdownsView 测试全文），不是从 import 推断覆盖。源文件修改处另做 diff 审核。表中的“已读”是起点内容；新测试与新增代码是随后编写/审核，不冒充起点阅读。最终源/测试共有 23 文件、2,700 行。

| 文件 | 起点显式已读范围 / 总行数 | 最终行数 |
| --- | --- | --- |
| `src/features/countdowns/CountdownsView.tsx` | 1–66 / 66 | 66 |
| `src/features/countdowns/CountdownsView.test.tsx` | 1–111 / 111 | 111 |
| `src/features/habits/HabitsView.tsx` | 1–145 / 145 | 146 |
| `src/features/habits/HabitsView.test.tsx` | 1–53 / 53 | 69 |
| `src/features/inbox/InboxView.tsx` | 1–51 / 51 | 51 |
| `src/features/inbox/InboxView.test.tsx` | 1–72 / 72 | 72 |
| `src/features/library/LibraryView.tsx` | 1–231 / 231 | 231 |
| `src/features/library/LibraryView.test.tsx` | 1–57 / 57 | 57 |
| `src/features/notes/NotesView.tsx` | 1–95 / 95 | 95 |
| `src/features/notes/NotesView.test.tsx` | 1–140 / 140 | 140 |
| `src/features/plan/PlanView.tsx` | 1–52 / 52 | 52 |
| `src/features/plan/PlanView.test.tsx` | 1–54 / 54 | 54 |
| `src/features/tasks/TasksView.tsx` | 1–164 / 164（1–105、106–164） | 164 |
| `src/features/tasks/TasksView.test.tsx` | 1–165 / 165（1–90、91–165） | 184 |
| `src/features/today/TodayView.tsx` | 1–349 / 349（1–100、101–210、211–285、286–349） | 349 |
| `src/features/today/TodayView.test.tsx` | 1–100 / 100 | 143 |
| `src/features/tools/ToolsView.tsx` | 1–36 / 36 | 36 |
| `src/features/tools/ToolsView.test.tsx` | 1–46 / 46 | 46 |
| `src/features/videos/VideosView.tsx` | 1–128 / 128 | 128 |
| `src/features/videos/VideosView.test.tsx` | 1–54 / 54 | 54 |
| `src/features/videos/CloudResourceView.tsx` | 1–81 / 81 | 102 |
| `src/features/videos/CloudResourceView.test.tsx` | 1–26 / 26 | 112 |
| `src/features/plan/WorkspaceViews.offline.test.tsx` | 本次新增；编写/审核 1–238，不计起点阅读 | 238 |

### 为追根因读取的依赖（只读，不扩张业务审计覆盖）

| 文件 | 显式读取范围 |
| --- | --- |
| `package.json`、`vitest.config.ts`、`tsconfig.json`、`src/test/setup.ts` | 分别全文 1–103、1–9、1–23、1–7 |
| `src/lib/time.ts` | 全文 1–117，日期/本地日历契约 |
| `src/lib/habitSchedule.ts` | 全文 1–125，due/streak/strength 契约 |
| `src/lib/today.ts` | 全文 1–126，下一步任务/资源 ID 与摘要契约 |
| `src/lib/resourceSources.ts`、`src/lib/bilibili.ts` | 全文 1–31、1–12，来源/链接/BVID 解析 |
| `src/store/useAppStore.ts` | 110–143、145–212、214–312、515–558、602–615、684–756；另作 API/存储标志符号定位，不宣称全文审计（当时 761 行） |
| `src/types.ts` | 57–78、94–115、185–214；类型定义节选，不宣称全文（307 行） |
| `src/components/QuickAdd.tsx` | 全文 1–34，提交契约 |
| `src/components/HabitFrequencyEditor.tsx` | 全文 1–124，取消/保存及频率输入契约；不编辑 |
| `src/features/bilibili/RixiaWorkspacePage.tsx` | 全文 1–32，仅核对容器/返回/embedded 契约；不编辑 |
| `src/App.tsx` | 160–164、186–193 路由片段；其余仅符号检索，不宣称 App 覆盖 |
| `src/styles/global.css` | 2808–2832、4879–4895，云资源布局/加载状态；其余未读 |
| `src/lib/overlayStack.ts` | 续接时只定位 72、147 行签名/返回 ref；不是 focus trap 审计 |
| `node_modules/react-dom/cjs/react-dom-client.development.js` | 5256–5279、20679–20702，核对 iframe/media 事件监听；不计第一方覆盖 |

`src/vite-env.d.ts` 只作为类型检查入口；Journal、Kaoyan、其他 Bilibili/组件/lib 即使被测试 import 或渲染，也不自动列为已读/已审计。

## 各视图检查结果与离线证据

| 视图 | 已检查的具体行为 | 限制 |
| --- | --- | --- |
| Countdowns | 名称/日期门禁、新增、过去/今天/未来展示、排序、删除、空状态 | 日期底层实现归主线程；被动跨日刷新没有解决 |
| Habits | 新增/打卡/批量仅 due 项、频率编辑取消/保存、删除、空状态、单位与统计契约 | 编辑器/习惯算法只读；未做所有浮点/非法快照组合 |
| Inbox | 输入修剪、新增、转为今日任务、删除、空状态；离线单项转换得到恰好 1 个任务 | 持久化原子性/跨标签页冲突归 store |
| Library | 继续/已保存过滤排序、删除、notes/inbox 预览、添加返回值、Bilibili/cloud 打开路由、空状态 | 当前 url 表示外部资源的契约成立，没有凭猜测改分流；无远端元数据验证 |
| Notes | 新建/编辑空值门禁、取消、保存、删除；离线实际 localStorage 重新水合 | 配额失败只保留内存不是落盘成功，见移交项 |
| Plan | 4 个 tab 的条件挂载/embedded、原有切换测试与离线默认页 | Kaoyan 本体/路由深链上下文不在本工人审计范围 |
| Tasks | 今天/待办/全部、切换完成、删除、编辑标题/日期、清空日期及取消草稿、批量逻辑、跨午夜新增 | 不改变默认 today 筛选，未增加全局时钟 |
| Today | 摘要/下一步/导航/任务与习惯操作/资源预览/回顾展开；修复导航和单位 | Journal/统计算法/过期任务定位需主线程确认 |
| Tools | 已启用工具过滤、跳转、空集合仍有说明 | 不新增 UI，未把无工具配置当崩溃 |
| Videos | 4 类来源、有效/无效输入、重复反馈、收藏、删除及打开逻辑；离线保存 4 类元数据，HTTP 拒绝且保留草稿 | “收藏元数据”不等于“下载视频” |
| CloudResource | 无资源退出、直链 video、iframe、加载/失败/重试、资源切换/URL 变化、网络/嵌入限制说明 | jsdom 不解码视频/执行真实跨源加载；CSP、第三方授权和 HLS 支持未验证 |

新增离线测试把 `navigator.onLine` 置为 false，并阻断/断言没有 fetch 或 XHR 调用；它们使用真实视图与真实 Zustand actions，不 mock 业务 store。11 个空/缺失状态、笔记离线持久化/编辑/删除、失败写盘后的内存保留、收集箱转任务、任务取消/清空到期日、习惯批量及频率取消/保存/删除、4 类资源元数据收藏、HTTP 草稿保留、资料库排序删除共 22 项通过。

**可据此演示的是本地数据与交互，不是离线流媒体或冷启动包可用性。** 本任务没有启动浏览器/真机、登录网盘、播放真实视频、验证 service worker/资源缓存/安装包。没有声称完成现场视觉或设备验证。

## 移交主模型，不越界修复

1. **存储可见性（有运行证据）**：`useAppStore.ts` 的 safeStorage 捕获 QuotaExceededError 后只 console.warn；Notes 等业务 action 没有可消费的持久化成功结果。离线探针证明新笔记仍在内存 UI，而 `rixia-v1` 原快照完全未变。主线程应在 store/App 层提供用户可见的未落盘告警/恢复策略；本工人不在每个视图伪造 try/catch 成功状态。
2. **下一步携带的目标被丢弃（静态链路已定位）**：`chooseNextAction` 可选择逾期 taskId；Today 只 setView(plan)，Plan 的 TasksView 默认 today，目标逾期任务不在当前筛选。resourceId 也仅导向 Library。需要与主线程的导航上下文/API 一并决定，不擅自改默认筛选、App 或 store。
3. **页面被动跨日/恢复刷新（静态已见，未声称运行验证）**：Countdowns/Habits/Tasks/Today 在渲染时求 todayKey，无统一午夜/恢复订阅。本次只修复已复现的“提交任务写到昨天”；一直静置的统计/倒计时日期刷新建议由公共时钟或 App 层统一负责。
4. **来源判别优先级（静态候选，未纳入已修复数）**：store.addResource 在判源前先 extractBvid。`https://cdn.example.com/BV1GJ411x7h7.mp4` 是 direct，但该解析器会取出 BV 号，从而可能丢弃 URL 存成 Bilibili。根因在 store/lib；建议主线程补混合输入回归。不要在视图里先添加再回滚资源。

未覆盖：损坏/敌意整包导入、所有异常日期/非法数字组合、所有存储失败与跨标签页竞争、后台节流/休眠、完整 App 导航上下文、共享 focus trap 本体、真实浏览器布局/响应式/可访问性、第三方页面可嵌入性与登录、HLS/容器编解码、native/安装包。未覆盖不等于无缺陷。

## 执行命令及终态

环境：Node `v24.17.0`，实际 Vitest `v3.2.7`，jsdom；所有测试都带 `--maxWorkers=2`。

| 命令（均在工作目录执行） | 观测到的终态 |
| --- | --- |
| `node node_modules/vitest/vitest.mjs run src/features/today/TodayView.test.tsx --maxWorkers=2` | 导航 RED：4 failed / 8 passed，exit 1 → GREEN：12 passed，exit 0 |
| `node node_modules/vitest/vitest.mjs run src/features/videos/CloudResourceView.test.tsx --maxWorkers=2` | 初始 RED：2 failed / 2 passed；首次修复仍 1 failed / 3 passed；纠正 iframe 假设并加入切换回归后 RED：4 failed / 3 passed；最终 GREEN：7 passed，exit 0。中间 RED 均 exit 1 |
| `node node_modules/vitest/vitest.mjs run src/features/tasks/TasksView.test.tsx --maxWorkers=2` | 午夜 RED：1 failed / 7 passed，exit 1 → GREEN：8 passed，exit 0 |
| `node node_modules/vitest/vitest.mjs run src/features/habits/HabitsView.test.tsx src/features/today/TodayView.test.tsx --maxWorkers=2` | 单位 RED：2 failed / 15 passed，exit 1 → GREEN：17 passed，exit 0 |
| `node node_modules/vitest/vitest.mjs run src/features/plan/WorkspaceViews.offline.test.tsx --maxWorkers=2` | 22 passed，exit 0；这是原行为审计探针，不伪称全部曾 RED |
| 原始 11 文件基线（参数清单见下方 `$baseTests`） | 53 passed，exit 0，9.47 秒 |
| 最终 12 文件（`$baseTests` 加 offline 文件） | 87 passed，exit 0，10.56 秒；12 文件均结束，无失败/跳过；最终启动时间 08:04:10 |
| `node --input-type=module -e $typecheckScript`（脚本见下方） | 25 个 roots，0 diagnostics，exit 0；含传递依赖，不代表这些依赖已逐行审计 |
| `git diff --check -- src/features/countdowns src/features/habits src/features/inbox src/features/library src/features/notes src/features/plan src/features/tasks src/features/today src/features/tools src/features/videos` | exit 0；有既存 core.autocrlf=true 的 LF→CRLF 提示，无 whitespace 错误 |

基线/最终测试的等价可复跑 PowerShell 命令（真实运行时使用同样的显式文件参数；没有使用全仓 glob）：

```powershell
$baseTests = @(
  'src/features/countdowns/CountdownsView.test.tsx',
  'src/features/habits/HabitsView.test.tsx',
  'src/features/inbox/InboxView.test.tsx',
  'src/features/library/LibraryView.test.tsx',
  'src/features/notes/NotesView.test.tsx',
  'src/features/plan/PlanView.test.tsx',
  'src/features/tasks/TasksView.test.tsx',
  'src/features/today/TodayView.test.tsx',
  'src/features/tools/ToolsView.test.tsx',
  'src/features/videos/VideosView.test.tsx',
  'src/features/videos/CloudResourceView.test.tsx'
)
node node_modules/vitest/vitest.mjs run @baseTests --maxWorkers=2
node node_modules/vitest/vitest.mjs run @baseTests src/features/plan/WorkspaceViews.offline.test.tsx --maxWorkers=2
```

限定类型检查（只读，不生成配置/产物）：

```powershell
$typecheckScript = @'
import ts from "typescript";
import path from "node:path";
const configFile = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
if (configFile.error) throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, process.cwd());
const scopes = ["countdowns", "habits", "inbox", "library", "notes", "plan", "tasks", "today", "tools", "videos"].map((name) => path.resolve("src/features", name) + path.sep);
const setupFile = path.resolve("src/test/setup.ts");
const rootNames = parsed.fileNames.filter((file) => file.endsWith(".d.ts") || path.resolve(file) === setupFile || scopes.some((scope) => path.resolve(file).startsWith(scope)));
const program = ts.createProgram({ rootNames, options: { ...parsed.options, noEmit: true, incremental: false } });
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
console.log(`Scoped TypeScript check: ${rootNames.length} roots; transitive imports are included.`);
if (diagnostics.length) {
  console.log(ts.formatDiagnostics(diagnostics, { getCurrentDirectory: () => process.cwd(), getCanonicalFileName: (file) => file, getNewLine: () => "\n" }));
  process.exitCode = 1;
} else {
  console.log("No TypeScript diagnostics.");
}
'@
node --input-type=module -e $typecheckScript
```

工具/校验过程中的失败也保留记录：最初 Windows batch 包装的 apply_patch 因多行参数报 `The last line of the patch must be '*** End Patch'`，exit 1、没有写入；改为同一 apply_patch 原生入口后成功。第一次自定义 scoped 类型检查遗漏 `src/test/setup.ts`，导致 jest-dom matcher 类型 TS2339，exit 1；补上入口而非修改业务代码后 exit 0。一次临时使用 `git -c core.autocrlf=false diff --check` 的检查绕过仓库现有换行策略，产生 CRLF whitespace 噪声并 exit 1；按原配置重跑 scoped diff/check 后 exit 0，没有更改用户 Git 配置或批量重写源文件换行。一个 RED 命令临时设置 `DEBUG_PRINT_LIMIT=400`，仅压缩测试失败 DOM 输出。

## 全部编辑路径

1. `src/features/habits/HabitsView.tsx`
2. `src/features/habits/HabitsView.test.tsx`
3. `src/features/tasks/TasksView.tsx`
4. `src/features/tasks/TasksView.test.tsx`
5. `src/features/today/TodayView.tsx`
6. `src/features/today/TodayView.test.tsx`
7. `src/features/videos/CloudResourceView.tsx`
8. `src/features/videos/CloudResourceView.test.tsx`
9. `src/features/plan/WorkspaceViews.offline.test.tsx`（新增）
10. `docs/WORKSPACE_VIEWS_AUDIT_2026-09-06.md`（新增）
