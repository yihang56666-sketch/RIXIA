# RIXIA 成熟度升级 · 开源项目调研与功能映射（2026-08-16）

本轮改版前，对多款口碑良好的开源效率应用做了功能与设计调研，并将其精华映射到 RIXIA 的本地优先架构中。

## 调研对象与结论

### FocuBili（用户指定参考）
- 仓库：https://github.com/L1Xu4n/FocuBili
- 定位：第三方 B 站客户端，口号「简洁，专注，降噪」。
- 结论：项目早期、无可直接借鉴的 UI 资产，但其产品哲学与本应用高度一致——**降噪、克制、把注意力留给内容本身**。作为总设计原则沿用。

### Loop Habit Tracker（uhabits，10k+ stars）
- 仓库：https://github.com/iSoron/uhabits ；官网：https://loophabits.org/
- 亮点：极简 Material 设计；每个习惯提供打卡日历、热力图、连续记录与「习惯强度」趋势统计，把长期数据变成可见的坚持。
- 采纳：**30 天习惯强度指标**（近 30 天打卡率，以小进度环呈现）、扩展热力图与最长连续统计（上一版已引入）。

### Super Productivity（隐私优先任务管理）
- 官网：https://super-productivity.com/ ；仓库：https://github.com/johannesjo/super-productivity
- 亮点：番茄钟自动衔接休息、时间追踪、每周回顾、命令面板与完整键盘操作，全部离线可用。
- 采纳：**专注→自动休息回合**、**每日专注目标**、**本周回顾（周环比）**、**⌘K 命令面板**。

### Pomotroid（可配置番茄钟）
- 仓库：https://github.com/splode/pomotroid
- 亮点：可配置专注/休息时长、长休息回合、每日统计、多主题皮肤。
- 采纳：**自定义专注时长步进**（上一版已引入）、**近 7 天专注分钟柱状图**、**休息回合可跳过**。

### Things 3（商业标杆，设计哲学参考）
- 长期评测：https://meetdaniel.me/blog/eight-years-with-things-3/ ；设计分析：https://ixd.prattsi.org/2020/02/design-critique-things-3-ios-app/
- 亮点：克制与打磨并存；捕获零摩擦；一切信息层级清晰。
- 采纳：**任务/笔记的即时编辑**（点击即改，消除"删了重建"的摩擦）、全局快速捕获入口（命令面板内置）。

### Obsidian / Logseq / Joplin（本地优先笔记）
- 综述：https://myflexnote.com/blog/best-local-first-note-taking-apps/
- 亮点：命令面板（⌘K）+ 全键盘导航是本地优先工具的「成熟感」标配。
- 采纳：**⌘K / Ctrl+K 全局命令面板**——跨任务/笔记/习惯/倒计时/收集箱搜索、视图跳转、主题切换、快速添加。

## 功能映射总表

| 来源 | 借鉴点 | RIXIA 落地 |
| --- | --- | --- |
| FocuBili | 简洁专注降噪 | 设计总原则，信息密度分层 |
| Loop Habit Tracker | 习惯强度统计 | 30 天强度环、热力图 |
| Super Productivity | 番茄自动休息、回顾、命令面板 | 休息回合、本周回顾、⌘K 面板 |
| Pomotroid | 回合统计、可配置时长 | 周专注图表、时长步进 |
| Things 3 | 零摩擦捕获与编辑 | 任务/笔记编辑弹窗 |
| Obsidian/Logseq | 键盘驱动 | 快捷键 + 命令面板 |

## 其他工程决策

- **PWA / Windows 支持**：手写 Service Worker 应用外壳缓存（不引入新依赖），使应用可在 Windows/Android 浏览器中离线安装。
- **备份闭环**：在已有 JSON 导出之上补充导入，形成完整的本机备份回路。
- **完成提示音**：Web Audio 合成短促提示音，零音频资源依赖。
- **屏幕常亮**：专注计时运行期间申请 Wake Lock（在不支持的浏览器上静默降级）。
