# Onboarding And Visual Polish Design

## Goal

Make BEID easier to understand at first sight. The app should clearly answer three questions:

1. What can this app do?
2. Which feature should I use for the thing I want to do?
3. How do I use that feature without exploring menus?

The design will make “watch a lesson + stay focused” the primary flow. Other productivity and maintenance features will remain reachable, but as supporting entry points.

## Current State

- `FeatureTour` already supports a first-run walkthrough, replay, spotlight, persistence, and real target clicks.
- It is only a sequence of static explanations. It does not organize the app by user intent, and it does not cover all major features.
- The home screen exposes many cards and secondary entries, but the hierarchy is not obvious.
- The shell has three primary destinations: 首页, 搜索, and 我的. More features appear as cards, subroutes, and command palette actions.
- Visual styling already has themes, M3 surfaces, and animation tokens, but icon styles, card density, and transition language are not fully unified.

## User Experience

### 1. Intent-first home

The home hero will keep the current calm entry, but the content below it will be grouped by intent:

- 继续看课: continue learning, search, learning list.
- 专注: start focus, active focus, focus data.
- 复习: exam countdown, review queue, tasks.
- 整理: notes, inbox, journal, habits, countdowns.
- 数据与系统: backup, cache, diagnostics, about.

Each group will have one concise purpose line. The most likely next action is visually strongest; less urgent actions become compact secondary controls.

### 2. Feature map

A reusable `FeatureMapDialog` will be reachable from:

- the home “功能地图” action,
- the command palette,
- 我的 / Profile Hub,
- the feature tour completion step.

The map shows grouped feature cards with:

- icon,
- name,
- one-sentence purpose,
- how to use,
- an optional “试一下” action,
- an optional “开始教学” action.

The map is explanatory, not a settings page. It does not duplicate every route control; it teaches where the route lives and why to use it.

### 3. Dynamic guided teaching

The existing tour engine will be upgraded into a task-based guide:

- 我想看课: home search → search input → open player → danmaku controls.
- 我想专注: home focus card → goal input → duration chips → start focus.
- 我想复习: exam countdown → review queue → task entry.
- 我想整理: notes → quick add → journal or habits.
- 我要备份数据: 我的 → backup/export controls.

Rules:

- Every step highlights a real control.
- If a target is clickable, the user advances by using the target, not only by pressing “下一步”.
- “下一步” remains as an escape hatch, but the completed action is preferred.
- Progress is saved per step and per completed task.
- Users can replay any task from “我的 → 功能教学”.
- First launch teaches the four-step core flow: 首页 → 搜索 → 播放器/弹幕 → 专注.
- The guide is non-blocking and can be skipped at any time.

## Visual Direction

- Use Lucide icons consistently for app-level navigation, feature map, and productivity actions.
- Keep existing theme tokens as the source of truth; do not add a new palette.
- Reduce duplicated card chrome and keep cards to one visual layer.
- Use clearer spacing scale: large hero, medium grouped sections, compact item rows.
- Increase visible hierarchy through weight, spacing, and one accent per group rather than decorative gradients.
- Use 150–240ms transitions for view entrance, card entrance, hover/active feedback, and dialog open/close.
- Add a small launch animation: brand mark fades and scales in, then the first usable surface fades in.
- Preserve reduced-motion behavior and custom background compatibility.

## Implementation Shape

1. Add a feature map catalog with stable IDs, categories, icons, copy, routes, and optional tour task IDs.
2. Build `FeatureMapDialog` from that catalog.
3. Extend `FeatureTour` to accept task-based step sets and real target completion.
4. Add `data-tour-target` markers to core controls.
5. Adjust home cards into grouped intent sections without changing store logic.
6. Add the launch animation and unify shell/card transition tokens.
7. Add tests for feature map rendering, tour task selection, target completion, persistence, and replay.

## Testing

Unit tests:

- Feature map shows all categories and opens the correct route.
- Feature tour starts the selected task.
- Clicking a real target completes the current step.
- Progress is persisted and replay clears it.
- First launch uses the core flow; explicit task launch uses that task.

UI checks:

- Desktop, tablet portrait, and narrow viewport layouts do not overflow.
- Feature map and tour cards remain usable with keyboard navigation.
- Spotlight tracks target position on resize.
- Reduced motion disables animation but not functionality.

## Out Of Scope

- No new external dependency or downloaded asset.
- No server-side onboarding state.
- No redesign of the Bilibili player internals.
- No migration of existing user data.
