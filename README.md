# BEID

BEID 是一个本地优先的个人节奏与学习工作台，融合个人效率工具（任务、习惯、笔记、日记、倒计时、番茄专注）与完整的 B 站学习体验（搜索、账号数据、DASH 播放、弹幕、学习清单、时间点笔记）。

基于 React 19 + TypeScript 5 + Vite 7 构建，通过 Capacitor 8 打包 Android 客户端。应用不需要外部服务端、数据库或分析依赖；所有个人数据通过 Zustand 持久化在本地，B 站在线功能走当前 Web 或原生网络路径。

## 设计语言

- **三层材质体系**：应用背景 → 导航表面 → 内容表面。模糊只用于导航、底部栏、弹层和模态——内容卡片使用实心表面 + 1px 边框 + 8px 圆角。
- **11 套独立皮肤** + 跟随系统模式。每套皮肤同时改变强调色、背景、表面材质、阴影与模糊。
- **三档密度**：舒适 / 标准 / 紧凑，全局调整控件高度与分区间距。
- **动效纪律**：220ms ease-out 视图切换，320ms spring 强调动效；`prefers-reduced-motion` 将所有动画压至 0.01ms。计时器与百分比使用等宽数字。
- **触屏与指针双感知**：悬停反馈仅在 `@media (hover: hover) and (pointer: fine)` 下生效；触控目标 ≥ 44px；尊重安全区内边距。

## 顶层导航

1. **首页（专注台）** — hero 吸附滚动 + 全部专注卡片 + 工作台双栏
2. **搜索** — B 站搜索（关键词 / BV 直达 / 筛选面板）
3. **我的** — 账号状态机 + 学习清单 / 观看记录 / 时间点笔记 / 设置入口群

收集箱不再占用常驻导航位——移动端经悬浮捕获按钮进入，桌面端经 `Ctrl/Cmd+K` 命令面板。

## 日常工作流

- **今日行动仪表盘**：固定优先级的下一步选择器（进行中专注 > 逾期/今日任务 > 最近未完成资源 > 收集箱 > 创建任务）
- **状态条**：任务、习惯、专注分钟、收集箱、下一个倒计时的紧凑胶囊
- **收集箱**：零摩擦捕获 → 一键转为今日任务
- **任务**：到期日、完成切换、内联编辑、删除
- **每日日记**：每天一条，markdown 渲染（懒加载），`#tag` 提取，`[[wiki 链接]]`

## 个人节奏工具

- **习惯**：三种频率类型（每日 / 每周 N 次 / 每 N 天一次）+ 自定义颜色 + 15 周热力图 + 30 天强度环 + 连续记录
- **笔记**：本地短备忘，内联编辑
- **倒计时**：追踪重要日期
- **专注**：可配置回合循环（工作 / 短休 / 长休 / 长休间隔）、阶段自动衔接、氛围音（白噪 / 雨声 / 海浪）、完成提示音（Web Audio）、计时期间屏幕常亮、7 天分钟数图表、每日目标追踪

## B 站学习集成

UI 直接调用内置的 B 站服务：公开搜索与元数据走 Web API 适配器；浏览器播放使用本机 DASH/MSE 管线（sidx 分段索引 seek）；Android 可选用捆绑的 Capacitor Media3 原生插件。账号数据、学习清单、观看历史、进度、弹幕偏好和时间点笔记全部由本项目持有并保存在本机。

## 进阶功能

- **命令面板**（`Ctrl/Cmd + K`）：跨任务、习惯、笔记、倒计时、收集箱、科目搜索；跳转任意视图；切换主题；从搜索创建任务
- **每周回顾**：今日页对比最近两个 7 天窗口的任务完成、习惯打卡和专注分钟
- **数据往返**：导出/导入 v3 JSON 备份（含 `validateBackup` 校验）
- **可安装 PWA**：打包 Service Worker，支持 Windows、Android 和桌面浏览器离线安装
- **密度切换**：舒适 / 标准 / 紧凑全局生效

## 考研规划器

- 创建科目（自定义颜色）与学习单元（起止日期）
- 科目与单元可重排序
- 单个学习日期可标记完成
- 错题、复习项（间隔重复）、模拟考成绩、单词与考试日期倒数
- 删除科目时级联清理其单元

## 技术

- React 19, React DOM 19
- TypeScript 5
- Vite 7
- Zustand 5（持久化，v3 格式，支持 v1/v2 迁移）
- Lucide React 图标
- Capacitor 8 Android 运行时（内置 Media3 播放器插件）
- Vitest 单元测试（111 个测试文件 / 580 个测试）
- Electron（Windows 桌面打包）

主状态模型位于 `src/store/useAppStore.ts`；功能页面组织在 `src/features` 下；共享的 B 站服务与播放代码位于 `src/lib/bilibili/`。

## 仓库布局

```text
src/
  components/        Shell, CommandPalette, CaptureButton, QuickAdd, Heatmap,
                    Modal, ProgressRing, Switch, HabitFrequencyEditor
  features/         today, plan, library, inbox, focus, habits, tasks, notes,
                    countdowns, kaoyan, settings, tools, videos, journal,
                    bilibili（搜索/播放器/账号/专注台/笔记等）
  lib/              time, stats, kaoyan, bilibili, migrations, today, journal,
                    backgroundImage, chime, noise, wakeLock, id, skinTokens,
                    habitSchedule, overlayStack
                    bilibili/  API, account, DASH playback, notes, focus, cache
  store/            useAppStore + tests
  styles/           global.css + focubili-m3.css（token 化主题系统）
  test/             setup + skinTokens fixture
android/            Capacitor Android 工程
electron/           Windows 桌面宿主
public/             应用图标、manifest、PWA Service Worker
scripts/            Android SDK 助手、跨视口校验器、构建脚本
docs/               设计说明、规格、计划
```

## 本地运行

要求：Node.js 20+, npm。

```bash
npm install
npm run dev
```

提交改动前：

```bash
npm test            # 479 tests
npm run typecheck
npm run build
```

跨视口构建完整性检查：

```bash
node scripts/verify-cross-viewport.mjs   # 15 assertions
```

## 构建 Windows 桌面包

```bash
npm run desktop:win     # electron-builder NSIS 安装包 + 便携版
npm run desktop         # 本地启动桌面宿主（开发）
```

## 构建 Android debug APK

Android 工程目标 SDK 36。需要 JDK 17+（推荐 21）、Android SDK Platform 36、Build Tools 36.x、Platform Tools。

```bash
npm run mobile:sync
cd android
./gradlew assembleDebug      # Windows 用 gradlew.bat
```

APK 生成于 `android/app/build/outputs/apk/debug/app-debug.apk`。辅助脚本：

```bash
npm run mobile:doctor        # 诊断 Android 工具链
npm run mobile:apk           # 自动构建 debug APK
npm run mobile:sdk:install   # 安装 SDK 到 .mobile-toolchain
```

## 数据与隐私

BEID 将应用状态保存在本地 `rixia-v1` 持久化键下（格式版本 3）。正常使用无需账号或网络连接。清除浏览器/WebView 站点数据会删除本地保存的内容，清除前请先导出备份。

## 项目状态

BEID 当前版本 `0.3.0`：11 套皮肤、三目的地导航、今日行动仪表盘、计划/资料库合并视图、B 站直连搜索与播放、每日日记、习惯频率类型、专注回合、v3 持久化迁移、跨视口完整性。公开播放与本地工作流均有回归测试覆盖。

## 许可证

仅供个人学习与研究使用，未声明开源许可证。仓库所有权归作者本人。
