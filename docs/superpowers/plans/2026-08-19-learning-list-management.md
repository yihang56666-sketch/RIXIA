# Learning List Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or equivalent TDD workflow) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match FocuBili's local learning-list management workflow in the merged Rixia application.

**Architecture:** Keep existing `LearningListEntry` records compatible and derive missing legacy state from their timestamps. Extend the local service with explicit three-state updates and persistent incomplete-item ordering; the React view consumes that API for query filtering, state selection, and native drag-and-drop.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, localStorage.

---

### Task 1: Persist local learning state and order

**Files:**
- Modify: `src/lib/bilibili/types.ts`
- Modify: `src/lib/bilibili/services.ts`
- Modify: `src/lib/bilibili/learningListService.test.ts`

- [x] Write a failing service test that moves an unfinished entry ahead of another and verifies `list()` preserves it.
- [x] Run `npm test -- --run src/lib/bilibili/learningListService.test.ts` and confirm failure because no reorder API exists.
- [x] Add `setStatus` and `reorderIncomplete`, preserving legacy records without a status or order value.
- [x] Re-run the focused service test and confirm it passes.

### Task 2: Expose management controls

**Files:**
- Modify: `src/features/bilibili/LearningListView.tsx`
- Modify: `src/features/bilibili/LearningListView.test.tsx`
- Modify: `src/styles/global.css`

- [x] Write a failing view test for title/UP/part query filtering and completed-item separation.
- [x] Run `npm test -- --run src/features/bilibili/LearningListView.test.tsx` and confirm failure because no search UI exists.
- [x] Add the local search field, status menu, unfinished/complete sections, and drag-drop callback to the service.
- [x] Re-run focused view and service tests with `npm run typecheck`.

### Task 3: Full verification

- [x] Run `npm test -- --run`, `npm run build`, and `npm run mobile:apk`; all must exit zero.
