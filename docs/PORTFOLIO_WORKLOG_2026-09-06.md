# 四项目工程准备工作记录

更新时间：2026-09-06（Asia/Shanghai）。本文件是进行中的事实检查点，不是完成声明。

## 总目标与边界

面向双选会，完成 clock / hardware-butler / magent Skill / 个人博客的可演示闭环、缺陷修复、面试说明书与可验证发布。保持既有产品边界，不以重写或堆功能替代质量；第一方源码、配置、测试和文档逐项审阅，依赖、生成副本、二进制与外部硬件行为分别列出，不把自动扫描等同于逐字审阅。

未进行 commit、branch、push、线上发布、凭据操作或真实硬件写入。GitHub 只考虑各仓库现有用户 origin；hardware 的 leo-origin 不属于交付目标。保留博客三张原有未跟踪截图及硬件项目原有 Word 文档。hardware/embeddedskills 是独立仓库，不处理其 Git 元数据。

## 主模型已复现并修复的 clock 问题

每项均先看到相邻回归失败，再修改实现；以下仅为对应批次结果，不代替最终全量验证。

| 问题 | 根因与修复 | 当批验证 |
| --- | --- | --- |
| 当前版本持久化数据绕过迁移 | persist merge 重新归一化，禁止持久化值覆盖 action，保留合法恢复字段 | persistence/backup/migration 42 tests / 5 files |
| 恢复备份时存储失败误报成功 | 捕获根写入和附属存储失败，报告部分持久化失败；不是事务回滚 | 同上 |
| 夏令时跨日错算 | 日历 setDate 替代固定 24 小时窗口 | 46 / 4 |
| 30 日复习未完成就判掌握 | 终态 stage 与六次间隔复习严格区分 | 45 / 5 |
| Wake Lock 在卸载后迟到泄漏 | 请求完成时检查生命周期，迟到锁立即释放 | 7 / 2 |
| 零分钟休息死锁及 NaN 图形 | 跳过零休息、保护分母 | 10 / 2 |
| 恢复备份后单例计时器覆盖新历史 | restore event + revision 保护重载/取消被替代提醒 | 19 / 4 |
| 跟随系统主题恒为浅色 | 实测 OS dark=true 而 Material mode=light；订阅媒体查询并同步表单 color-scheme | 18 / 3 |
| 原生 deep link / share 生命周期泄漏 | 同一 effect 管理 disposed、AbortSignal、晚到 disposer、异步路由回调；拒绝写入诊断 | 24 / 4，含共享 helper 回归 |

早期基线是 112 files / 591 tests；本轮最终验证为 126 个 Vitest 文件 / 750 个 Vitest 测试，另有 32 个 Electron/发布边界 Node 测试。该数字来自实际命令输出，不把构建警告或未覆盖真机路径算作通过。（2026-09-09 复核：126 个 Vitest 文件 / 762 个 Vitest 测试。）

日志目录：output/readiness/。原生 App RED 为 5 failures / 6 tests 和 4 个未观察 rejection；同批 GREEN 无这些 rejection。系统主题 RED 为 3 failures / 3，修复后在独立 Chromium 暗色配置刷新及观察 DOM 成功。截图在本地 Codex visualizations 下，未上传。

## 各范围交接

- clock native/desktop/release：Gibbs 完成并关闭；详情 docs/NATIVE_AUDIT_2026-09-05.md。报告 32 Node + 15 JVM，Android 离线 debug 编译通过；包使用旧前端 assets，不能当最终发布产物。真机与 Windows 安装未验证。
- clock lib/bilibili 与播放器：Volta 收尾中；App 的 AbortSignal 调用侧已由主模型集成。
- clock Bilibili 其余视图：Wegener 审查中，禁止与 Player/useFocusTimer 重叠。
- clock 普通工作台视图：Noether 审查中，仅 features/countdowns、habits、inbox、library、notes、plan、tasks、today、tools、videos。
- hardware core：Cicero 审查与修复中；生成插件镜像由主模型在该范围稳定后更新。
- hardware GUI/nextboard：Kepler 原任务曾遇 transport error，已对原 ID 发送继续指令，未把超时误当完成或开重复工人。
- magent Skill：Einstein 只读审阅原 24 个文件后关闭；主模型修复授权、临界路径、内容基线、单轮单专家、超时/关闭语义等；27/27 结构测试通过。结构通过不能证明真实模型行为。
- blog：Archimedes 完成改版交付并关闭；报告 docs/BLOG_REDESIGN_VALIDATION.md，55 Playwright tests 通过（实现者证据）。Gauss 正做独立只读 spec/质量审查，主模型随后核对展示效果与项目事实。

## 下一阶段必须完成

1. 收齐限定范围报告并复核修复，继续主模型尚未覆盖的组件、迁移边界和配置/发布链审查。
2. 为每仓形成明确的已读/自动检查/未验证清单；不要把已读取但输出截断的范围计为逐行审完。
3. 更新硬件插件生成副本，完成隔离 CLI/mock 演示、Ruff/mypy/pytest、nextboard/插件校验。
4. Skill 增加一次真实有界原生委派验收记录，更新旧指南与测试数字。
5. 四仓详细中文面试指南：实际架构、演示、修复案例、权衡、追问、作者/AI/第三方贡献与限制。
6. 最终全量测试、生产构建、桌面/手机/键盘/主题/路由浏览器验证；最终 Android assets 同步后再构建，设备/Windows 未验证处明确标记。
7. 审查差异、敏感信息、许可证和发布内容后再提交发布；确认远端和博客实际部署，不仅凭 push 命令称上线。
