# BEID（clock）HR 面试指导书

更新：2026-09-30。只写仓库里已经落地、可用测试复现的事实。

## 一句话介绍

BEID 是本地优先的个人节奏与学习工作台：任务、习惯、日记、专注、考研规划与 B 站 DASH 播放共用一套 React 领域模型，可打包 Web / Electron / Capacitor Android。

## 30 秒说法

> 我做的是本地优先学习台，不是又一个待办清单。个人数据默认只落本机；B 站搜索、DASH 播放和学习笔记共用同一份状态。最近又修了 BV 直链误判、专注统计 UTC 日漂移、专注分钟钳制不一致。回归是 762 Vitest + 32 Node 边界测试。

## 架构怎么讲（面试官一问就展开）

```
features/   按领域拆页（today/plan/focus/habits/kaoyan/bilibili...）
lib/        时间、迁移、B站服务、播放器、备份、唤醒锁
store/      Zustand + persist schema v3 + 迁移
electron/   桌面宿主 + 本地反代（补 Referer/Cookie）
android/    Capacitor + Media3 插件
```

**数据流**：UI action → store set → persist 写 localStorage；B 站账号/媒体走 `httpAdapter` 按环境选 Web 代理 / Electron 反代 / CapacitorHttp。

## 五个可深挖技术点（每个都能顶 3 分钟）

1. **DASH/MSE 管线**：自己解析 playurl，不嵌 iframe；`mp4Boxes.ts` 解析 sidx；seek 到未缓冲区时 abort 代际、清 SourceBuffer、按字节偏移重启拉流。
2. **本地优先与迁移**：persist version；v1/v2→v3 迁移函数；配额失败推 `storageWriteFailed`；companion backup 覆盖主 store 外的键。
3. **锚定计时**：`endsAtMs` 绝对时间戳是唯一真源；切视图/重启可恢复；根治后台节流计时漂移。
4. **习惯频率模型**：daily / weekly-N / interval-N 参与 due-today / streak / strength，不是只按日历打卡。
5. **多端网络适配**：开发 localhost 用 Vite 代理；Electron 有 desktop-server 反代；生产纯 Web 受 CORS/防盗链限制（诚实说）。

## 可演示路径

```powershell
npm install
npm run dev
npm test
npm run typecheck
```

现场：造逾期任务 → 点“开始”应进计划页仍可见；资料库粘贴含 BV 的直链应保存为 HTTPS 直链。

## HR 高频追问（含最难的）

**为什么本地优先？**  
个人数据隐私 + 离线可用 + 无服务端成本。联网只在 B 站内容/账号需要时。

**状态怎么迁？**  
持久化带 version；迁移补齐旧结构；导入失败或根快照写失败会明确提示，不假装恢复成功。

**Cookie 存哪？安全吗？**  
个人应用存在本机 localStorage。能解释 XSS 可窃取 SESSDATA 的威胁模型；不假装企业级密钥管理。这是自用工具的取舍。

**播放器为什么不用官方 iframe？**  
要单一控制层：时间点笔记、专注联动、清晰度偏好、全屏手势都要挂在自己的 UI 上。代价是要自己处理 DASH、WBI、CDN 防盗链。

**B 站接口改了怎么办？**  
适配层集中在 `src/lib/bilibili/`；失败路径有友好提示；公开搜索/元数据可 mock 回归。不保证 API 永久可用。

**测试 762 个证明什么？**  
证明领域逻辑、迁移、store 边界有回归；不证明真机扫码/播放已验收——那要现场设备。

**2679 行播放器组件是不是上帝对象？**  
诚实承认：`BilibiliPlayerView` 职责过重，是已知架构债。播放引擎、控制条、弹幕、笔记可继续拆 hook/子组件；拆分是维护策略，不是已经做完的事。

**最近修了什么？**  
- BV 正则排除 `0` 导致合法 BV 号被拒 → 全仓统一 `/BV[0-9A-Za-z]{10}/`  
- 专注连击用 UTC 日，东八区 0–8 点会错一天 → 改本地 `todayKey()`  
- 专注分钟 UI 5–90 vs store 1–120 不一致 → 对齐  

## 限制（主动说）

- 扫码真机、Android 真机播放、Windows 安装包需现场验收  
- 生产纯 Web 部署 B 站能力受限（CORS/防盗链）  
- 播放器组件仍偏大，是维护债不是功能缺失  
- **两套专注体系并存**：番茄专注在 Zustand `activeFocus`，B 站学习专注在 `focusTimerController` + 独立 localStorage 键；今日仪表盘只接前者，统计看板只接后者——已知产品分裂，不是「统一工作台」  
- **多标签页 storage 同步是整份 rehydrate 覆盖，不是字段级 merge**；companion 键不同步  
- **播放器测试大量 mock DashPlayer/playurl**，762 绿不等于 MSE 真机可用  
- `resumeFromLastPosition` 偏好对「观看历史恢复」路径可能仍生效（对抗审查指出，待修）  

## 面试最危险 5 问（准备好）

1. 多标签页冲突怎么 merge？→ 诚实：当前是覆盖，不是 CRDT/字段合并。  
2. 播放器里的专注为何今日页看不到？→ 两套专注状态机未合并，已知债。  
3. 762 测试等于播放稳定吗？→ 不等于；Player 大量 mock。  
4. 关掉「从上次位置继续」真的不跳吗？→ 历史恢复路径曾绕过开关，需复验。  
5. License 是什么？→ package.json MIT + 根目录 LICENSE；README 已对齐。

## 简历可用句

设计并实现本地优先学习工作台 BEID，统一任务/习惯/考研/B 站学习状态；自研 sidx 定位的 DASH/MSE 播放管线；修复 BV 误判、UTC 连击日与专注钳制不一致，并补回归测试（762+32）。
