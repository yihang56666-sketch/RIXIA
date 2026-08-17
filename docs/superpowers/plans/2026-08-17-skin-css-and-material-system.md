# RIXIA 皮肤 CSS 重写与塑料感修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 `src/styles/global.css` 与 `src/catalog.ts` 脱钩导致的所有皮肤失效问题，并消除"每个内容卡都是悬浮玻璃卡"的塑料感，建立三层材质、阴影纪律、圆角令牌、动效纪律。

**Architecture:** 重写 CSS 主题令牌选择器，从 8 个旧键（paper/mist/matcha/sunset/ink/graphite/dusk/deep）改为 11 个新键（porcelain/graphite/sage/aurora/rosewood/mono/ocean/ember/lavender/ink/system），并新增 `--content-surface`、`--content-surface-strong`、`--nav-surface`、`--radius-sm/md/lg/xl` 等令牌。删除普通内容卡上的 `backdrop-filter` + `box-shadow` + hover `translateY`，仅保留导航/弹层/底部栏的模糊。

**Tech Stack:** CSS custom properties, React 19, TypeScript 5, Vitest（用于断言 catalog 与 CSS 选择器的一致性）。

**Spec reference:** `docs/superpowers/specs/2026-08-17-rixia-maturity-redesign-v2.md` §3, §4

---

## 文件地图

- `src/styles/global.css`：重写主题令牌选择器与三层材质；删除塑料感样式。
- `src/catalog.ts`：新增 `MATERIAL_TOKENS` 导出（用于测试断言），不改 `THEMES` 数据结构。
- `src/lib/skinTokens.test.ts`：新增测试，断言 catalog 皮肤键与 CSS 选择器一致。
- `src/test/skinTokens.fixture.ts`：抽取一段 global.css 的快照字符串，供测试解析。

## Task 1: 建立皮肤令牌测试与 catalog 一致性守卫

**Files:**
- Modify: `src/catalog.ts`
- Create: `src/lib/skinTokens.test.ts`
- Create: `src/test/skinTokens.fixture.ts`

- [ ] **Step 1: 写失败测试**

`src/lib/skinTokens.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { THEMES } from "../catalog";
import { GLOBAL_CSS_SNIPPET } from "../test/skinTokens.fixture";

describe("skin tokens match catalog", () => {
  it("every THEMES key has a matching :root[data-theme] selector in CSS", () => {
    const missing: string[] = [];
    for (const theme of THEMES) {
      const selector = `:root[data-theme="${theme.key}"]`;
      if (!GLOBAL_CSS_SNIPPET.includes(selector)) missing.push(theme.key);
    }
    expect(missing, `missing CSS selectors for: ${missing.join(", ")}`).toEqual([]);
  });

  it("no legacy skin keys remain in CSS", () => {
    const legacy = ["paper", "mist", "matcha", "sunset", "dusk", "deep"];
    for (const key of legacy) {
      expect(
        GLOBAL_CSS_SNIPPET,
        `legacy key "${key}" still present in CSS`,
      ).not.toContain(`data-theme="${key}"`);
    }
  });

  it("every THEMES entry defines a dark flag consistent with color-scheme", () => {
    for (const theme of THEMES) {
      if (theme.key === "system") continue;
      const block = GLOBAL_CSS_SNIPPET.split(`:root[data-theme="${theme.key}"]`)[1];
      if (!block) continue;
      const slice = block.slice(0, 400);
      if (theme.dark) {
        expect(slice, `${theme.key} should be dark`).toContain("color-scheme: dark");
      } else {
        expect(slice, `${theme.key} should be light`).toContain("color-scheme: light");
      }
    }
  });
});
```

`src/test/skinTokens.fixture.ts`:

```ts
// 抽取 src/styles/global.css 的主题选择器块作为测试 fixture。
// 真正的 CSS 内容由 Task 2 写入；此处先导出空字符串让测试失败。
export const GLOBAL_CSS_SNIPPET = "";
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/lib/skinTokens.test.ts`

Expected: FAIL — `missing CSS selectors for: porcelain, graphite, sage, aurora, rosewood, mono, ocean, ember, lavender, ink, system`（因为 fixture 为空字符串）。

- [ ] **Step 3: 在 catalog.ts 导出 MATERIAL_TOKENS（可选辅助）**

在 `src/catalog.ts` 末尾追加：

```ts
export const MATERIAL_TOKENS = {
  solid: { contentSurface: "var(--content-surface-strong)", blur: "none" },
  translucent: { contentSurface: "var(--content-surface)", blur: "blur(8px)" },
  "high-contrast": { contentSurface: "var(--content-surface-strong)", blur: "none" },
} as const;
```

- [ ] **Step 4: 运行测试仍失败**

Run: `npm test -- src/lib/skinTokens.test.ts`

Expected: FAIL（fixture 仍为空）。

- [ ] **Step 5: 提交**

```bash
git add src/catalog.ts src/lib/skinTokens.test.ts src/test/skinTokens.fixture.ts
git commit -m "test: add skin token catalog-CSS consistency guard"
```

## Task 2: 重写 11 个皮肤的 CSS 令牌块

**Files:**
- Modify: `src/styles/global.css:1-207`（替换旧主题块）
- Modify: `src/test/skinTokens.fixture.ts`（注入真实 CSS）

- [ ] **Step 1: 替换 global.css 的主题令牌块**

将 `src/styles/global.css` 第 1 行到第 207 行（从开头到 `:root[data-theme="deep"]` 块结束）整体替换为以下内容：

```css
/* ============================================================
   RIXIA 设计系统
   —— 三层材质、克制阴影、多皮肤主题
   ============================================================ */

/* ---------- 主题令牌 ---------- */

:root,
:root[data-theme="porcelain"] {
  color-scheme: light;
  --bg-base: #f6f4f0;
  --bg-tint-1: rgba(10, 132, 255, 0.06);
  --bg-tint-2: rgba(120, 130, 150, 0.05);
  --app-bg: #f6f4f0;
  --nav-surface: rgba(255, 255, 255, 0.78);
  --content-surface: #ffffff;
  --content-surface-strong: #ffffff;
  --text: #1a1a1f;
  --text-2: #6a6a72;
  --text-3: #a0a0a8;
  --line: rgba(20, 20, 30, 0.08);
  --line-strong: rgba(20, 20, 30, 0.16);
  --accent: #0a84ff;
  --accent-deep: #0060dF;
  --accent-contrast: #ffffff;
  --accent-soft: rgba(10, 132, 255, 0.10);
  --good: #2f9e6f;
  --danger: #d04848;
  --ring-track: rgba(20, 20, 30, 0.08);
  --shadow: 0 1px 2px rgba(20, 20, 30, 0.04);
  --shadow-lg: 0 4px 16px rgba(20, 20, 30, 0.08), 0 12px 32px rgba(20, 20, 30, 0.06);
  --glow: 0 0 0 2px var(--accent-soft);
  --blur-nav: 20px;
}

:root[data-theme="graphite"] {
  color-scheme: dark;
  --bg-base: #131417;
  --bg-tint-1: rgba(143, 184, 216, 0.05);
  --bg-tint-2: rgba(120, 130, 150, 0.04);
  --app-bg: #131417;
  --nav-surface: rgba(29, 31, 35, 0.78);
  --content-surface: #1d1f23;
  --content-surface-strong: #202327;
  --text: #ececee;
  --text-2: #9b9ba3;
  --text-3: #6d6d76;
  --line: rgba(255, 255, 255, 0.08);
  --line-strong: rgba(255, 255, 255, 0.16);
  --accent: #8fb8d8;
  --accent-deep: #6f9bc0;
  --accent-contrast: #0d0e10;
  --accent-soft: rgba(143, 184, 216, 0.10);
  --good: #4ab388;
  --danger: #e06a6a;
  --ring-track: rgba(255, 255, 255, 0.08);
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.5), 0 12px 32px rgba(0, 0, 0, 0.4);
  --glow: 0 0 0 2px var(--accent-soft);
  --blur-nav: 20px;
}

:root[data-theme="sage"] {
  color-scheme: light;
  --bg-base: #eef1ea;
  --bg-tint-1: rgba(63, 143, 95, 0.06);
  --bg-tint-2: rgba(120, 150, 110, 0.05);
  --app-bg: #eef1ea;
  --nav-surface: rgba(251, 253, 248, 0.80);
  --content-surface: #fbfdf8;
  --content-surface-strong: #fbfdf8;
  --text: #1f2620;
  --text-2: #6a7568;
  --text-3: #9ba89b;
  --line: rgba(35, 43, 32, 0.08);
  --line-strong: rgba(35, 43, 32, 0.16);
  --accent: #3f8f5f;
  --accent-deep: #2f7148;
  --accent-contrast: #ffffff;
  --accent-soft: rgba(63, 143, 95, 0.10);
  --good: #3f8f5f;
  --danger: #c4524a;
  --ring-track: rgba(35, 43, 32, 0.08);
  --shadow: 0 1px 2px rgba(38, 61, 42, 0.04);
  --shadow-lg: 0 4px 16px rgba(38, 61, 42, 0.06), 0 12px 32px rgba(38, 61, 42, 0.05);
  --glow: 0 0 0 2px var(--accent-soft);
  --blur-nav: 20px;
}

:root[data-theme="aurora"] {
  color-scheme: light;
  --bg-base: #eef5f4;
  --bg-tint-1: rgba(43, 182, 165, 0.06);
  --bg-tint-2: rgba(255, 122, 122, 0.05);
  --app-bg: #eef5f4;
  --nav-surface: rgba(255, 255, 255, 0.74);
  --content-surface: rgba(255, 255, 255, 0.94);
  --content-surface-strong: #ffffff;
  --text: #16302e;
  --text-2: #5f7872;
  --text-3: #97a8a4;
  --line: rgba(22, 48, 46, 0.08);
  --line-strong: rgba(22, 48, 46, 0.16);
  --accent: #2bb6a5;
  --accent-deep: #1f8f80;
  --accent-contrast: #ffffff;
  --accent-soft: rgba(43, 182, 165, 0.10);
  --good: #2f9e6f;
  --danger: #d04848;
  --ring-track: rgba(22, 48, 46, 0.08);
  --shadow: 0 1px 2px rgba(22, 60, 56, 0.04);
  --shadow-lg: 0 4px 16px rgba(22, 60, 56, 0.06), 0 12px 32px rgba(22, 60, 56, 0.05);
  --glow: 0 0 0 2px var(--accent-soft);
  --blur-nav: 20px;
}

:root[data-theme="rosewood"] {
  color-scheme: dark;
  --bg-base: #1c1517;
  --bg-tint-1: rgba(217, 119, 115, 0.05);
  --bg-tint-2: rgba(120, 100, 100, 0.04);
  --app-bg: #1c1517;
  --nav-surface: rgba(42, 32, 34, 0.78);
  --content-surface: #2a2022;
  --content-surface-strong: #2e2426;
  --text: #f0e4e2;
  --text-2: #b39a98;
  --text-3: #806a68;
  --line: rgba(240, 228, 226, 0.08);
  --line-strong: rgba(240, 228, 226, 0.16);
  --accent: #d97773;
  --accent-deep: #b85c58;
  --accent-contrast: #1c1517;
  --accent-soft: rgba(217, 119, 115, 0.10);
  --good: #4ab388;
  --danger: #e06a6a;
  --ring-track: rgba(240, 228, 226, 0.08);
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.5), 0 12px 32px rgba(0, 0, 0, 0.4);
  --glow: 0 0 0 2px var(--accent-soft);
  --blur-nav: 20px;
}

:root[data-theme="mono"] {
  color-scheme: light;
  --bg-base: #ffffff;
  --bg-tint-1: rgba(0, 0, 0, 0);
  --bg-tint-2: rgba(0, 0, 0, 0);
  --app-bg: #ffffff;
  --nav-surface: #ffffff;
  --content-surface: #ffffff;
  --content-surface-strong: #ffffff;
  --text: #000000;
  --text-2: #555555;
  --text-3: #888888;
  --line: rgba(0, 0, 0, 0.12);
  --line-strong: rgba(0, 0, 0, 0.24);
  --accent: #111111;
  --accent-deep: #000000;
  --accent-contrast: #ffffff;
  --accent-soft: rgba(0, 0, 0, 0.06);
  --good: #2f9e6f;
  --danger: #d04848;
  --ring-track: rgba(0, 0, 0, 0.10);
  --shadow: none;
  --shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.10);
  --glow: 0 0 0 2px rgba(0, 0, 0, 0.10);
  --blur-nav: 0px;
}

:root[data-theme="ocean"] {
  color-scheme: dark;
  --bg-base: #0d1420;
  --bg-tint-1: rgba(56, 189, 248, 0.05);
  --bg-tint-2: rgba(80, 120, 160, 0.04);
  --app-bg: #0d1420;
  --nav-surface: rgba(22, 32, 46, 0.78);
  --content-surface: #16202e;
  --content-surface-strong: #1a2536;
  --text: #e2eaf2;
  --text-2: #94a8bd;
  --text-3: #687a8e;
  --line: rgba(226, 234, 242, 0.08);
  --line-strong: rgba(226, 234, 242, 0.16);
  --accent: #38bdf8;
  --accent-deep: #1e94c4;
  --accent-contrast: #0d1420;
  --accent-soft: rgba(56, 189, 248, 0.10);
  --good: #4ab388;
  --danger: #e06a6a;
  --ring-track: rgba(226, 234, 242, 0.08);
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  --shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.6), 0 12px 32px rgba(0, 0, 0, 0.45);
  --glow: 0 0 0 2px var(--accent-soft);
  --blur-nav: 20px;
}

:root[data-theme="ember"] {
  color-scheme: dark;
  --bg-base: #161513;
  --bg-tint-1: rgba(224, 160, 64, 0.05);
  --bg-tint-2: rgba(120, 100, 70, 0.04);
  --app-bg: #161513;
  --nav-surface: rgba(34, 32, 28, 0.78);
  --content-surface: #22201c;
  --content-surface-strong: #27241f;
  --text: #eee8de;
  --text-2: #b3a895;
  --text-3: #807868;
  --line: rgba(238, 232, 222, 0.08);
  --line-strong: rgba(238, 232, 222, 0.16);
  --accent: #e0a040;
  --accent-deep: #b88028;
  --accent-contrast: #161513;
  --accent-soft: rgba(224, 160, 64, 0.10);
  --good: #4ab388;
  --danger: #e06a6a;
  --ring-track: rgba(238, 232, 222, 0.08);
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.5), 0 12px 32px rgba(0, 0, 0, 0.4);
  --glow: 0 0 0 2px var(--accent-soft);
  --blur-nav: 20px;
}

:root[data-theme="lavender"] {
  color-scheme: light;
  --bg-base: #f4f3f8;
  --bg-tint-1: rgba(124, 108, 209, 0.06);
  --bg-tint-2: rgba(150, 140, 180, 0.05);
  --app-bg: #f4f3f8;
  --nav-surface: rgba(255, 255, 255, 0.80);
  --content-surface: #ffffff;
  --content-surface-strong: #ffffff;
  --text: #1c1a28;
  --text-2: #6a6480;
  --text-3: #9c96b0;
  --line: rgba(28, 26, 40, 0.08);
  --line-strong: rgba(28, 26, 40, 0.16);
  --accent: #7c6cd1;
  --accent-deep: #5d4fb0;
  --accent-contrast: #ffffff;
  --accent-soft: rgba(124, 108, 209, 0.10);
  --good: #2f9e6f;
  --danger: #d04848;
  --ring-track: rgba(28, 26, 40, 0.08);
  --shadow: 0 1px 2px rgba(28, 26, 40, 0.04);
  --shadow-lg: 0 4px 16px rgba(28, 26, 40, 0.06), 0 12px 32px rgba(28, 26, 40, 0.05);
  --glow: 0 0 0 2px var(--accent-soft);
  --blur-nav: 20px;
}

:root[data-theme="ink"] {
  color-scheme: dark;
  --bg-base: #0f0f12;
  --bg-tint-1: rgba(232, 93, 74, 0.05);
  --bg-tint-2: rgba(120, 100, 100, 0.04);
  --app-bg: #0f0f12;
  --nav-surface: rgba(26, 26, 31, 0.82);
  --content-surface: #1a1a1f;
  --content-surface-strong: #1f1f25;
  --text: #f0ece5;
  --text-2: #b3a89a;
  --text-3: #807668;
  --line: rgba(240, 236, 229, 0.10);
  --line-strong: rgba(240, 236, 229, 0.20);
  --accent: #e85d4a;
  --accent-deep: #c04433;
  --accent-contrast: #0f0f12;
  --accent-soft: rgba(232, 93, 74, 0.12);
  --good: #4ab388;
  --danger: #e06a6a;
  --ring-track: rgba(240, 236, 229, 0.10);
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  --shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.7), 0 12px 32px rgba(0, 0, 0, 0.5);
  --glow: 0 0 0 2px var(--accent-soft);
  --blur-nav: 20px;
}

/* system：跟随系统深浅，在 porcelain 与 graphite 之间切换 */
:root[data-theme="system"] {
  color-scheme: light dark;
  --bg-base: #f6f4f0;
  --bg-tint-1: rgba(10, 132, 255, 0.06);
  --bg-tint-2: rgba(120, 130, 150, 0.05);
  --app-bg: #f6f4f0;
  --nav-surface: rgba(255, 255, 255, 0.78);
  --content-surface: #ffffff;
  --content-surface-strong: #ffffff;
  --text: #1a1a1f;
  --text-2: #6a6a72;
  --text-3: #a0a0a8;
  --line: rgba(20, 20, 30, 0.08);
  --line-strong: rgba(20, 20, 30, 0.16);
  --accent: #0a84ff;
  --accent-deep: #0060df;
  --accent-contrast: #ffffff;
  --accent-soft: rgba(10, 132, 255, 0.10);
  --good: #2f9e6f;
  --danger: #d04848;
  --ring-track: rgba(20, 20, 30, 0.08);
  --shadow: 0 1px 2px rgba(20, 20, 30, 0.04);
  --shadow-lg: 0 4px 16px rgba(20, 20, 30, 0.08), 0 12px 32px rgba(20, 20, 30, 0.06);
  --glow: 0 0 0 2px var(--accent-soft);
  --blur-nav: 20px;
}

@media (prefers-color-scheme: dark) {
  :root[data-theme="system"] {
    --bg-base: #131417;
    --bg-tint-1: rgba(143, 184, 216, 0.05);
    --bg-tint-2: rgba(120, 130, 150, 0.04);
    --app-bg: #131417;
    --nav-surface: rgba(29, 31, 35, 0.78);
    --content-surface: #1d1f23;
    --content-surface-strong: #202327;
    --text: #ececee;
    --text-2: #9b9ba3;
    --text-3: #6d6d76;
    --line: rgba(255, 255, 255, 0.08);
    --line-strong: rgba(255, 255, 255, 0.16);
    --accent: #8fb8d8;
    --accent-deep: #6f9bc0;
    --accent-contrast: #0d0e10;
    --accent-soft: rgba(143, 184, 216, 0.10);
    --good: #4ab388;
    --danger: #e06a6a;
    --ring-track: rgba(255, 255, 255, 0.08);
    --shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
    --shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.5), 0 12px 32px rgba(0, 0, 0, 0.4);
    --glow: 0 0 0 2px var(--accent-soft);
  }
}
```

- [ ] **Step 2: 更新 fixture 为真实 CSS 文本**

`src/test/skinTokens.fixture.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const cssPath = resolve(__dirname, "../../styles/global.css");
export const GLOBAL_CSS_SNIPPET = readFileSync(cssPath, "utf-8");
```

- [ ] **Step 3: 运行测试确认通过**

Run: `npm test -- src/lib/skinTokens.test.ts`

Expected: PASS — 11 个皮肤键都有对应选择器，旧键已全部移除，color-scheme 与 dark 标志一致。

- [ ] **Step 4: 运行 typecheck 与 build**

Run: `npm run typecheck && npm run build`

Expected: PASS。CSS 不参与 TS 检查，但 fixture 引用了 node:fs，需确认 vitest 配置允许。

- [ ] **Step 5: 提交**

```bash
git add src/styles/global.css src/test/skinTokens.fixture.ts
git commit -m "feat: rewrite skin CSS to match v2 catalog keys"
```

## Task 3: 修复三层材质、阴影纪律、圆角令牌

**Files:**
- Modify: `src/styles/global.css`（在 `.card`、`.tool-card`、`.stat-tile`、`.countdown-card`、`.note-card`、`.sidebar`、`.tabbar`、`.page-head`、`.modal`、`.palette` 等选择器中替换样式）

- [ ] **Step 1: 在动效令牌块后追加半径令牌**

在 `src/styles/global.css` 的 `:root { --ease-spring... }` 块（约第 211-217 行）末尾追加：

```css
:root {
  --ease-spring: cubic-bezier(0.32, 0.72, 0, 1);
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius: var(--radius-md);
  --radius-legacy-sm: var(--radius-sm);
  --blur: var(--blur-nav);
}

[data-density="compact"] { --control-h: 36px; --section-gap: 14px; }
[data-density="standard"] { --control-h: 42px; --section-gap: 20px; }
[data-density="comfortable"] { --control-h: 48px; --section-gap: 26px; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 2: 重写 .card 为三层材质的内容表面**

将 `src/styles/global.css` 第 339-349 行的 `.card` 块替换为：

```css
.card {
  position: relative;
  background: var(--content-surface-strong);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  padding: 17px;
  animation: fadeUp 0.5s var(--ease-out) both;
}
```

删除 `backdrop-filter` 与 `box-shadow`。

- [ ] **Step 3: 删除 .view-stage 的入场动画级联**

将 `src/styles/global.css` 第 350-355 行的 `.view-stage > *:nth-child(N)` 全部删除（保留 `.view-stage` 本身）。

- [ ] **Step 4: 修复 .tool-card、.stat-tile、.countdown-card、.note-card 的 hover**

将下列 4 个 `:hover` 规则全部替换为仅 accent 描边反馈：

```css
.tool-card:hover { border-color: color-mix(in srgb, var(--accent) 35%, var(--line)); }
.tool-card:active { transform: scale(0.98); }

.stat-tile:hover { border-color: color-mix(in srgb, var(--accent) 30%, var(--line)); }

.countdown-card:hover { border-color: color-mix(in srgb, var(--accent) 30%, var(--line)); }

.note-card:hover { border-color: color-mix(in srgb, var(--accent) 30%, var(--line)); }
```

删除所有 `transform: translateY(-Npx)` 与 `box-shadow: var(--shadow-lg)` 在 hover 中的使用。

- [ ] **Step 5: 仅导航与浮层保留 backdrop-filter**

在 `.sidebar`、`.tabbar`、`.page-head`、`.palette-card`、`.modal`、`.palette-overlay` 选择器内保留 `backdrop-filter: blur(var(--blur-nav)) saturate(1.2)`，但确保它们都使用 `var(--nav-surface)` 作为背景，而不是 `var(--surface)`。

如果发现任何选择器同时使用 `var(--surface)` 与 `backdrop-filter`，把它改为 `var(--nav-surface)`。

- [ ] **Step 6: .primary 按钮保留轻投影但删除 translateY**

将 `src/styles/global.css` 第 416-417 行：

```css
.primary:hover { transform: translateY(-1px); filter: brightness(1.05); }
.primary:active { transform: scale(0.97); }
```

改为：

```css
.primary:hover { filter: brightness(1.05); }
.primary:active { transform: scale(0.98); }
```

- [ ] **Step 7: 运行测试与 build**

Run: `npm test && npm run typecheck && npm run build`

Expected: PASS。所有现有测试仍通过（CSS 变更不影响单元测试），build 成功。

- [ ] **Step 8: 提交**

```bash
git add src/styles/global.css
git commit -m "refactor: enforce 3-tier material system and shadow discipline"
```

## Task 4: 视觉验收

**Files:**
- 不修改文件，仅启动 dev server 并人工检查。

- [ ] **Step 1: 启动 dev server**

Run: `npm run dev`

打开 `http://127.0.0.1:5173`（或控制台打印的端口）。

- [ ] **Step 2: 切换皮肤验证**

在设置页切换到每个皮肤（porcelain / graphite / sage / aurora / rosewood / mono / ocean / ember / lavender / ink / system），断言：

- 浅色皮肤：背景与卡片明显可区分，正文对比度可读。
- 深色皮肤：背景深色，卡片表面略浅，正文白色或浅灰。
- mono：纯黑白，无模糊。
- system：切换系统深浅模式时皮肤跟随。

- [ ] **Step 3: 验证塑料感已消除**

在 Today 视图检查：

- 内容卡无玻璃模糊（背后内容不应透过卡片）。
- 卡片 hover 不再向上跳（仅 border 变色）。
- 底部栏与侧栏仍有毛玻璃感。
- 主按钮 hover 不向上跳。

- [ ] **Step 4: 验证动效降级**

在系统设置中开启"减少动态效果"，刷新页面，断言：

- 视图切换无明显动画。
- 列表入场无级联动画。

- [ ] **Step 5: 提交（如果需要）**

Run: `git status`

Expected: 无变更（视觉验收不产生 diff）。

---

## 验收清单

- [ ] 11 个皮肤键都在 CSS 中有对应 `:root[data-theme="<key>"]` 选择器。
- [ ] 旧键（paper/mist/matcha/sunset/dusk/deep）从 CSS 中删除。
- [ ] `color-scheme` 与 catalog 的 `dark` 标志一致。
- [ ] `.card` 不再使用 `backdrop-filter` 与 `box-shadow`。
- [ ] `.tool-card`、`.stat-tile`、`.countdown-card`、`.note-card` 的 hover 不再 `translateY`。
- [ ] 仅 `.sidebar`、`.tabbar`、`.page-head`、`.palette-card`、`.modal` 保留 `backdrop-filter`。
- [ ] 圆角令牌 `--radius-sm/md/lg/xl` 存在，`.card` 使用 `--radius-md`。
- [ ] `prefers-reduced-motion` 下动画 ≤ 0.01ms。
- [ ] 密度三档通过 `data-density` 切换 `--control-h` 与 `--section-gap`。
- [ ] `npm test`、`npm run typecheck`、`npm run build` 全部通过。
