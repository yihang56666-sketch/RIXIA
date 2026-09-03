# 项目组合审计（2026-09-02）

| 项目 | 当前判断 | 已验证证据 | 仍需人工验收 |
| --- | --- | --- | --- |
| 博客 `D:\boke` | 可展示，已修复 canonical 和归档内容回归 | Playwright 13/13 通过 | GitHub Pages 线上部署和 CDN 网络环境 |
| BEID `clock` | 代码和测试完整度高，工作区仍有大量未提交改动 | 580 tests passed；typecheck/build/跨视口检查通过 | 真实 B 站扫码/Android 播放 |
| Hardware Butler | 非硬件路径完成，文档契约已修复 | ruff 通过；mypy 72 文件通过；739 passed、4 skipped | 真实板卡、探针、编译器和供电环境 |
| 子智能体 Skill | 契约完整，可作为方法论项目展示 | unittest 20/20 通过 | 支持原生 spawn_agent 的实际协作演练 |

## 指导书

- [博客 HR 指导书](D:\boke\docs\HR_PROJECT_GUIDE.md)
- [BEID HR 指导书](D:\一些有用的项目\clock\docs\HR_PROJECT_GUIDE.md)
- [Hardware Butler HR 指导书](D:\一些有用的项目\硬件agent\docs\HR_PROJECT_GUIDE.md)
- [子智能体 Skill HR 指导书](D:\一些有用的项目\子智能体\docs\HR_PROJECT_GUIDE.md)

## 已完成修复

1. 博客路由元数据：首页和无效路由的 canonical 统一为 `https://yihang56666-sketch.github.io`，内容页保留可定位的 Hash URL。
2. Hardware Butler README：补齐与 `tools/github_launch_audit.py`、`pyproject.toml` 一致的英文项目描述，修复文档契约测试。

## 面试前建议

优先准备四个 90 秒演示：博客 Hash 路由与响应式阅读、BEID 今日工作台与本地备份、Hardware Butler mock 九阶段工作流、子智能体 dispatch contract。涉及账号、网络或真实硬件时，明确说出“已由测试证明”和“待现场验收”的边界。
