# Yihang 双选会简历

求职意向：嵌入式软件 / 工具链 / 客户端 / AI 应用开发

联系方式：电话待现场补充；邮箱 yihang56666@gmail.com；GitHub https://github.com/Yihang56666-sketch；博客 https://yihang56666-sketch.github.io

> 本稿只写公开仓库和本地实测可复现的项目事实；教育经历请按现场投递版补充。

## 求职方向

面向嵌入式软件、工具链、客户端或 AI 工程岗位。能把硬件工作流、本地应用和智能体协作做成可演示、可回归、能讲清边界的作品。

## 技术栈

- 语言与框架：TypeScript / React 19 / Vite、Python 3.10+、PyQt6、Electron、Capacitor Android
- 工程能力：Zustand 本地持久化与版本迁移、Playwright / Vitest / pytest、ruff / mypy、安全门控、文档契约测试
- 领域：嵌入式工作流编排、B 站学习播放与本地学习台、静态作品集、原生子智能体分派协议

## 项目经历

### BEID / RIXIA · 本地优先学习工作台

React 19 + TypeScript + Vite；Zustand 持久化与迁移；PWA / Electron / Capacitor Android。\
仓库：https://github.com/yihang56666-sketch/RIXIA

- 把任务、习惯、日记、专注计时、考研规划和 B 站学习播放收进同一套领域模型，个人数据默认只落本地。
- 修复过真实产品缺陷：直链文件名含 BV 号会被误收成 B 站视频；逾期任务点“下一步”后在今日筛选里消失；存储配额失败只打日志。
- 面试可讲：本地优先、schema 迁移、DASH/MSE 播放、账号状态机、测试与真机验收的分界；当前 763 个 Vitest、32 个发布边界 Node 测试、typecheck 和生产构建通过。

### Hardware Butler · 嵌入式工作流与安全执行

Python 3.10+；CLI + PyQt6 GUI；9 阶段工作流。\
仓库：https://github.com/yihang56666-sketch/hardware-butler

- 把一句话硬件需求拆成需求、选型、资料、CubeMX、固件、构建、烧录、观测和验证。默认 mock；真实烧录必须环境变量 + 确认 token + 产物校验同时满足。
- 覆盖 14 个厂商族；GUI 13 个 tab、CLI 35 个扁平子命令。LLM 只生成结构化意图，执行器和门控由确定性代码掌控。
- 非硬件路径可回归（1013 passed / 12 skipped；ruff / mypy / 插件校验通过）。真实板卡、探针和供电仍需现场 runbook。

### magent · Codex 子智能体编排协议

声明式 Skill，不是自研运行时。\
仓库：https://github.com/yihang56666-sketch/magent

- 把何时委派、给谁、允许读什么、交付什么证据、失败如何收尾写成可加载协议；主智能体独占写入和最终验证。
- 用内容指纹而不是 git status 判断脏工作区二次修改；把等待超时和子任务终止分开。
- 33 项结构契约测试覆盖授权门、人数规则、分派字段和隐私路径自指防护。不把结构通过说成真实模型行为保证。

### 个人工程博客

无构建原生 HTML/CSS/JS；Hash 路由。\
站点：https://yihang56666-sketch.github.io

- 首页直接展示工程方向和真实项目，而不是大封面装饰。
- 修复过 CDN 回退、搜索 IME、主题存储失败和路由快捷键竞态；当前 15 个 Playwright 回归覆盖桌面 / 手机、深浅主题、键盘路由和视觉证据。

## 90 秒演示

1. 博客：首页工程定位 → 项目筛选 → 源仓库入口。
2. BEID：今日下一步 → 逾期任务仍能看见 → 本地备份。
3. Hardware Butler：fixture mock 九阶段，主动说明未做真机烧录。
4. magent：现场跑结构测试，打开分派契约；没有原生工具时不伪造执行日志。

## 不要夸大

- BEID 的 B 站扫码、真机播放和线上 Pages 部署仍需现场验收。
- Hardware Butler 的真实板卡未在本材料中宣称完成。
- magent 的 33 项测试是结构契约，不是端到端成功率。
