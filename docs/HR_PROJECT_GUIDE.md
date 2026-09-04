# BEID（clock）HR 面试指导书

## 一句话介绍

BEID 是一个本地优先的个人节奏与学习工作台，把任务、习惯、日记、专注计时、考研规划和 B 站学习播放整合到一个 React 客户端，并可打包为 PWA、Electron 桌面端和 Capacitor Android 应用。

## 技术与架构

- React 19 + TypeScript + Vite；Zustand 持久化本地状态，支持 v1/v2 到 v3 迁移和 JSON 备份恢复。
- `src/App.tsx` 负责视图接线和原生深链；`src/features` 按领域拆分页面；`src/lib` 放时间统计、迁移、B 站 API/DASH 播放、音频和唤醒锁等可复用逻辑。
- B 站能力包括搜索、公开元数据、DASH/MSE 播放、弹幕、选集、学习清单、时间点笔记和扫码登录；Android 可走 Media3 原生播放器。
- CSS 使用 Material 3 token、11 套皮肤和舒适/标准/紧凑密度；触控目标、reduced-motion 和安全区均有适配。

## 可演示路径

```powershell
cd D:\一些有用的项目\clock
npm install
npm run dev
npm test
npm run typecheck
npm run build
```

当前验证：591 tests passed（112 个文件）、TypeScript 0 错误、Vite 生产构建通过。备份已扩展为覆盖视频笔记/学习清单/专注历史/观看历史的全量快照；全屏统一 CSS 方案后弹窗不再被吞。跨视口脚本需要先启动 Vite，再运行 `node scripts/verify-cross-viewport.mjs`。真实 B 站账号扫码和网络播放属于人工验收边界。

## HR 常问与回答

**为什么本地优先？** 任务、笔记和学习记录属于个人数据，离线可用能降低服务端成本和隐私风险；联网只在 B 站内容和账号功能需要时发生。

**如何处理状态迁移？** 持久化数据带 schema version，迁移函数把旧结构补齐为当前结构，并用测试覆盖导入、导出和旧版本字段清理。

**播放链路怎么做？** 搜索获得 B 站元数据后，播放器请求 DASH 音视频轨道，用 MSE 管理 SourceBuffer；桌面/Android 通过平台适配层复用同一领域模型。

**如何避免真实账号或网络失败拖垮 UI？** API 层统一返回可判定的状态，页面有 loading、empty、error 和 retry 分支；账号状态机支持二维码生成、扫码确认、过期和断网恢复。

**测试重点是什么？** 领域库、Zustand store、迁移、组件交互和播放器手势均有 Vitest/Testing Library 回归；当前测试输出有少量 React `act` 和 jsdom canvas 警告，但不影响通过结果。

**目前限制是什么？** B 站接口受网络、Cookie 和平台策略影响；Android 真机播放器和账号扫码仍需要设备/账号验收，不能把 mock 或单元测试说成真实线上验收。

## 下一步

完成一次扫码账号实测、补齐播放器/UP 主页的浏览器回归，并通过动态 import 拆分 500KB 以上主 bundle。
