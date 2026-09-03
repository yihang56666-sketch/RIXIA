# Project Portfolio Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify four portfolio repositories, repair directly actionable regressions, and produce HR-facing project guides grounded in the current code.

**Architecture:** Run repository-native tests and build checks first. Apply only minimal fixes for reproducible failures, then add one portfolio-level audit and four project guides without changing unrelated user work.

**Tech Stack:** Vanilla HTML/CSS/JS + Playwright; React/TypeScript/Vite/Vitest; Python/pytest/ruff/mypy; Markdown.

---

### Task 1: Establish baselines

- [x] Inspect Git status, repository instructions, README, package metadata, tests, and documented project status for all four repositories.
- [x] Run native tests, type checks, builds, and static checks; record failures and environmental blockers.

### Task 2: Repair reproducible regressions

**Files:**
- Modify: `D:/boke/assets/app.js`
- Modify: `D:/一些有用的项目/硬件agent/README.md`

- [x] Normalize blog home and not-found canonical metadata to the site origin while preserving route-specific metadata for content pages.
- [x] Add the exact repository description required by `tools/github_launch_audit.py` to the hardware agent README.
- [x] Re-run focused tests, then full repository verification.

### Task 3: Produce interview guides

**Files:**
- Create: `D:/boke/docs/HR_PROJECT_GUIDE.md`
- Create: `D:/一些有用的项目/clock/docs/HR_PROJECT_GUIDE.md`
- Create: `D:/一些有用的项目/硬件agent/docs/HR_PROJECT_GUIDE.md`
- Create: `D:/一些有用的项目/子智能体/docs/HR_PROJECT_GUIDE.md`
- Create: `D:/一些有用的项目/PROJECT_PORTFOLIO_AUDIT.md`

- [x] Document each project's problem, architecture, key implementation details, evidence-backed status, demo steps, likely HR questions, honest limitations, and next improvements.
- [x] Link all guides from the portfolio audit and include exact verification commands and current results.

### Task 4: Final verification

- [x] Re-run all changed-project tests and checks from a clean command invocation.
- [x] Review Git diffs and confirm no unrelated files were modified.
- [x] Report passing checks, remaining warnings, and hardware/account/manual-validation boundaries.
