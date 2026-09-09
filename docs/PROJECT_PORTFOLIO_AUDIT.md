# 项目组合审计（2026-09-06）

| 项目 | 当前判断 | 已验证证据 | 仍需人工验收 |
| --- | --- | --- | --- |
| 博客 | 可展示，项目事实已与源仓库对齐 | 本地改版与 Playwright 回归存在；本轮同步了 BEID / 13 tab / 1017 passed + 12 skipped / 33 契约数字 | GitHub Pages 线上是否已部署本轮改动 |
| BEID `clock` | 核心工作台可演示；本轮修了四类产品缺陷和播放器卸载计时器泄漏 | 762 tests、32 个 Node 原生边界测试、typecheck/build 通过 | B 站扫码、真机播放、Windows 安装 |
| Hardware Butler | 非硬件路径完整 | 1017 passed、12 skipped；ruff/mypy/插件校验通过 | 真实板卡、探针、编译器和供电 |
| 子智能体 Skill | 方法论项目可展示 | 33 项结构契约 | 原生线程工具真实调用演练 |

## 指导书与简历

- 博客仓库 `docs/HR_PROJECT_GUIDE.md`
- BEID 仓库 `docs/HR_PROJECT_GUIDE.md`
- Hardware Butler 仓库 `docs/HR_PROJECT_GUIDE.md`
- 子智能体仓库 `docs/HR_PROJECT_GUIDE.md`
- 博客仓库 `docs/beid-dual-selection-resume.docx`

## 面试前 90 秒

博客工程定位 → BEID 今日下一步与本地备份 → Hardware Butler mock 九阶段 → magent 分派契约。涉及账号、网络或真实硬件时，先说“测试已证明”和“待现场验收”的边界。
