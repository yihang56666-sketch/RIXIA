# Portfolio Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver reproducible, defensible portfolio projects with verified fixes and a redesigned blog.

**Architecture:** Preserve product boundaries; separate repository/core/native write scopes; main agent independently integrates and verifies. Defect-specific RED/GREEN cases are recorded when reproduced rather than inventing defects in advance.

**Tech Stack:** React/TypeScript/Vite/Vitest/Capacitor/Electron, Python/pytest/unittest/PyQt, HTML/CSS/JS/Playwright, GitHub.

## 1. Baseline

- [x] Read instructions and record branches, remotes and existing work.
- [x] Select evidence-driven repair rather than cosmetic-only or full rewrite.
- [ ] Classify tracked first-party text, generated mirrors, dependencies and binaries.
- [ ] Record baseline commands and outcomes for all products.

## 2. clock core — main agent

Write scope: src/, package.json, Vite/Vitest configuration, application docs.

- [ ] Read types, stores, persistence, imports, services, hooks and feature views.
- [ ] For each confirmed defect: adjacent failing regression test, targeted RED command, minimal root-cause fix, GREEN command.
- [ ] Run npm test -- --reporter=dot, npm run typecheck, npm run build.
- [ ] Check important routes and offline demonstration at desktop and mobile widths.

## 3. clock native/release — independent worker

Write scope: android/, electron/, scripts/, src-tauri/ only; do not change application src/.

- [ ] Inspect native bridges, desktop input/network boundaries and packaging.
- [ ] Reproduce and fix defects without increasing permissions.
- [ ] Run available native checks/builds and state unavailable device checks.

## 4. Hardware execution core — independent worker

Write scope: tools/ and associated tests/unit/; exclude plugin packager and generated copies until integration.

- [ ] Inspect configuration, process/path boundaries, workflow states, safety gate, adapters and errors.
- [ ] Add failing pytest regressions before repairing actionable defects.
- [ ] Run targeted pytest, Ruff and mypy; supply exact reviewed files and evidence.

## 5. Hardware presentation and distribution — follow-up

Write scope: gui/, launch_gui.py, nextboard/, plugin packager/mirrors and public docs.

- [ ] Verify launch paths, mock demonstration, nextboard content and nested dependency boundary.
- [ ] Regenerate plugin from canonical sources after core repairs.
- [ ] Run full pytest, package and nextboard validators, CLI demo on a temporary project.
- [ ] Never invoke real flash/debug operations or mutate embeddedskills Git metadata.

## 6. Skill contract — read-only reviewer, main writer

Scope: codex-native-subagent-orchestrator/, tests/test_skill_contract.py and public docs.

- [ ] Read every public file and compare protocols/examples with actual tool semantics.
- [ ] Main agent writes regression tests, reproduces failure, fixes confirmed inconsistencies.
- [ ] Run python -m unittest discover -s tests -v and available local Skill validator.

## 7. Blog redesign — independent worker

Write scope in <blog-repo-root>: index.html, 404.html, assets/app.js, assets/styles.css, tests and related docs.

- [ ] Preserve existing routes, articles, local images/fonts and theme behavior.
- [ ] Document visual implementation and define browser checks before behavior changes.
- [ ] Implement readable hierarchy, coherent portfolio design, responsive and accessible controls.
- [ ] Run Playwright, inspect desktop/mobile screenshots and repair visual defects.

## 8. Adversarial review

- [ ] Different reviewers challenge bounded patches and test realism.
- [ ] Main agent adjudicates with source evidence, resolves valid findings, reruns checks.
- [ ] Record actual coverage and explicit exclusions, not blanket perfection claims.

## 9. Interview materials

Files per repository: docs/HR_PROJECT_GUIDE.md, docs/PROJECT_PORTFOLIO_AUDIT.md, README.md.

- [ ] Update architecture, demo, bugs, tradeoffs, interview questions and honest limitations.
- [ ] Replace stale counts with final dated command results.
- [ ] Align blog project cases with verified code and evidence.

## 10. Release

- [ ] Review final diffs and sensitive/artifact checks without exposing credentials.
- [ ] Check origin and upstream; stage only task-owned reviewed files.
- [ ] Publish verified appropriate changes non-destructively; confirm remote results and blog.

## Initial state

- clock: main at 46ff23c; clean; origin yihang56666-sketch/RIXIA.
- hardware: main at cf1cd9e; preserve untracked user Word document; origin yihang56666-sketch/hardware-butler; never push leo-origin.
- Skill: github-public-release at 7ca4138; clean; origin yihang56666-sketch/magent.
- blog: main at c886d00; preserve three untracked screenshots; origin yihang56666-sketch/Yihang56666-sketch.github.io.
