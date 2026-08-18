# Bilibili User Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a video/user search mode to the Bilibili search view and route user results into the existing creator profile screen.

**Architecture:** Keep network and parsing logic in `publicContentService.ts`; the search panel owns mode-specific query state and renders one result list at a time. The outer search view maps `UserSearchResult` to the existing store creator shape and calls `openBilibiliCreator`, so creator profile behavior remains centralized.

**Tech Stack:** React, TypeScript, Zustand, Vitest, Testing Library, lucide-react.

---

### Task 1: Add the component contract test

**Files:**
- Modify: `src/features/bilibili/BilibiliSearchView.test.tsx`
- Modify: `src/features/bilibili/BilibiliSearchView.tsx`

- [ ] **Step 1: Write the failing test**

Mock the public service with `searchUsers` returning one user, render `BilibiliSearchView`, click the `用户` mode, submit a keyword, then click the user row and assert `useAppStore.getState().openBilibiliCreator` was called with `mid`, `name`, `avatarUrl`, `sign`, and `officialDescription`.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- --run src/features/bilibili/BilibiliSearchView.test.tsx`

Expected: FAIL because the search view has no `用户` mode or user result row.

### Task 2: Implement user mode and navigation

**Files:**
- Modify: `src/features/bilibili/BilibiliSearchView.tsx`

- [ ] **Step 1: Add mode and user state**

Add `SearchMode = "video" | "user"`, `UserSearchResult[]`, user page/total page state, and import `DEFAULT_USER_SEARCH_FILTER`, `UserSearchOrder`, `UserSearchType`, and `type UserSearchResult`.

- [ ] **Step 2: Branch search execution**

Keep the existing video request unchanged. When mode is `user`, call `service.searchUsers(keyword, page, userFilter)`, store the user page, and reset the opposite result list. Reset pagination/results on mode changes.

- [ ] **Step 3: Render user controls and rows**

Render a segmented `视频`/`用户` control, user order/type selects, and rows containing avatar, name, certification/signature, follower count, and level. The user row invokes an `onPickUser` callback.

- [ ] **Step 4: Wire the outer view to the store**

Read `openBilibiliCreator` from the store and map the selected user into the existing creator shape; preserve the current `onPick` video behavior.

- [ ] **Step 5: Run the focused test**

Run: `npm test -- --run src/features/bilibili/BilibiliSearchView.test.tsx`

Expected: PASS.

### Task 3: Verify regressions and production output

**Files:**
- No source changes expected.

- [ ] **Step 1: Run all tests**

Run: `npm test -- --run`

Expected: all test files pass.

- [ ] **Step 2: Build the web app**

Run: `npm run build`

Expected: Vite build succeeds; an existing large-chunk warning is acceptable.

- [ ] **Step 3: Build the Android APK**

Run: `npm run mobile:apk`

Expected: Gradle reports `BUILD SUCCESSFUL` and produces `android/app/build/outputs/apk/debug/app-debug.apk`.

- [ ] **Step 4: Check the diff**

Run: `git diff --check`

Expected: no whitespace errors.

