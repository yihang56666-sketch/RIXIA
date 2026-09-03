# 平板播放器与学习工作台改造实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 完成平板交互、播放器控制、时间点笔记、考研计划和网盘资源入口的端到端改造。

**Architecture:** 保留现有 Zustand/store 与 Capacitor/Media3 边界，新增统一返回处理和资源来源模型；播放器 Web/Mobile 共用 UI 状态，平台差异只留在控制适配器。

**Tech Stack:** React + TypeScript + Vitest + Capacitor Android + Media3 + CSS media queries。

---

### Task 1: 统一返回和响应式布局

**Files:** `src/components/Shell.tsx`, `src/components/Shell.test.tsx`, `src/styles/global.css`

- [ ] 添加 Android `backButton`/`popstate` 监听，按全屏、弹窗、播放器、页面历史优先级分发。
- [ ] 为播放器页和所有工作台页提供固定可见的安全区返回按钮。
- [ ] 为控制栏和菜单增加窄屏横向滚动、最大高度和安全区样式。
- [ ] 为系统返回、菜单关闭和窄屏控件增加测试。

### Task 2: 播放器控制与反馈

**Files:** `src/features/bilibili/BilibiliPlayerView.tsx`, `src/features/bilibili/BilibiliPlayerView.test.tsx`, `src/styles/global.css`, `android/app/src/main/java/com/beid/app/BeidNativePlayerPlugin.java`

- [ ] 抽出统一控制动作，确保原生路径和 MSE 路径同时更新音量、倍速、进度和清晰度。
- [ ] 优化控制栏为可滚动工具带，补齐音量滑杆、清晰度/倍速入口和触摸反馈。
- [ ] 全屏进入/退出时重新同步原生播放器边界和系统栏状态。
- [ ] 笔记保存显示成功、失败、重试和撤销反馈。
- [ ] 增加控制动作和全屏回退测试，重新验证 Android 构建。

### Task 3: 考研计划工作台

**Files:** `src/features/kaoyan/KaoyanView.tsx`, `src/features/kaoyan/KaoyanView.test.tsx`, `src/store/useAppStore.ts`, `src/styles/global.css`

- [ ] 建立目标日期、科目阶段、每日任务和复习记录的本地模型。
- [ ] 实现概览、阶段、今日任务、复习记录四个视图及编辑流程。
- [ ] 对空状态、过期目标和完成状态提供明确反馈。
- [ ] 增加创建、编辑、勾选、恢复和持久化测试。

### Task 4: 网盘资源入口

**Files:** `src/features/videos/VideosView.tsx`, `src/features/videos/VideosView.test.tsx`, `src/lib/resourceSources.ts`, `src/lib/resourceSources.test.ts`

- [ ] 增加 B 站、夸克、百度网盘来源选择和链接解析。
- [ ] 对未授权网盘显示“打开官方 App/网页登录”动作；不伪造直播放能力。
- [ ] 对用户手动提供的公开直链按 HTTPS 校验后进入统一资源卡片。
- [ ] 增加来源识别、非法链接和授权缺失测试。

### Task 5: 验证与平板回归

**Files:** `release/BEID-0.3.0-android-debug.apk`

- [ ] 运行全量 Vitest、TypeScript、Vite 和 Android APK 构建。
- [ ] 安装 APK 到 `HA22LKX3`，回归返回、播放器控制、全屏、笔记、计划和未登录资源入口。
- [ ] 遇到扫码登录停下，保留设备页面等待用户操作。
